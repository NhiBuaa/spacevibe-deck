import {
  REPOSITORY,
  POLL_MS,
  requireCiJobs,
  requireJobs,
  validateAssets,
} from "./release-cut-model.mjs";

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

export function createGithub(
  run,
  { sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now } = {},
) {
  const request = (path, extra = []) =>
    run("gh", ["api", "--hostname", "github.com", `repos/${REPOSITORY}/${path}`, ...extra]);
  const json = (path) => {
    try {
      return JSON.parse(request(path));
    } catch (error) {
      throw new Error(`GitHub ${path}: ${error.message}`, { cause: error });
    }
  };
  function pages(path, field) {
    let result = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const value = json(
        `${path}${path.includes("?") ? "&" : "?"}per_page=${PAGE_SIZE}&page=${page}`,
      );
      const entries = field ? value[field] : value;
      if (!Array.isArray(entries)) throw new Error(`Malformed GitHub list: ${path}`);
      result = [...result, ...entries];
      if (entries.length < PAGE_SIZE) return result;
    }
    throw new Error(`GitHub pagination limit reached: ${path}`);
  }
  function release(tag) {
    // HTTP status comes from gh's explicit error, never an arbitrary CLI failure.
    try {
      return json(`releases/tags/${encodeURIComponent(tag)}`);
    } catch (error) {
      if (/\(HTTP 404\)/u.test(error.message)) return null;
      throw error;
    }
  }
  function baseline() {
    const value = json("releases/latest");
    if (
      value.draft !== false ||
      value.prerelease !== false ||
      !/^v\d+\.\d+\.\d+$/u.test(value.tag_name)
    ) {
      throw new Error("Latest release is not a promoted stable baseline");
    }
    return value;
  }
  function noPendingRelease() {
    const pending = pages("releases").find((value) => value.draft === true);
    if (pending)
      throw new Error(`Unresolved draft ${pending.tag_name}; recover it before another cut`);
    const runs = pages("actions/workflows/electron-release.yml/runs?event=push", "workflow_runs");
    const active = runs.find((value) => value.status !== "completed");
    if (active) throw new Error(`Release run ${active.id} is still active`);
  }
  async function watch(workflow, sha, branch, timeout, validate) {
    const deadline = now() + timeout;
    while (now() < deadline) {
      const matches = pages(
        `actions/workflows/${workflow}/runs?event=push&head_sha=${sha}`,
        "workflow_runs",
      )
        .filter(
          (value) =>
            value.event === "push" && value.head_sha === sha && value.head_branch === branch,
        )
        .sort((a, b) => b.id - a.id);
      if (matches.length > 0) {
        const selected = matches[0];
        if (!Number.isSafeInteger(selected.id) || !Number.isSafeInteger(selected.run_attempt)) {
          throw new Error(`Malformed ${workflow} run identity`);
        }
        const attempt = json(`actions/runs/${selected.id}/attempts/${selected.run_attempt}`);
        if (
          attempt.head_sha !== sha ||
          attempt.event !== "push" ||
          attempt.head_branch !== branch
        ) {
          throw new Error("Workflow attempt identity changed");
        }
        if (attempt.status === "completed") {
          if (attempt.conclusion !== "success")
            throw new Error(`${workflow} ${attempt.html_url}: ${attempt.conclusion}`);
          const jobs = pages(
            `actions/runs/${selected.id}/attempts/${selected.run_attempt}/jobs`,
            "jobs",
          );
          validate(jobs);
          return attempt;
        }
        if (
          !["queued", "in_progress", "waiting", "pending", "requested"].includes(attempt.status)
        ) {
          throw new Error(`Unknown workflow status ${attempt.status}`);
        }
      }
      await sleep(POLL_MS);
    }
    throw new Error(`Timed out waiting for ${workflow} on ${sha}; inspect the run before resuming`);
  }
  async function promotion(sha, version, timeout, notes) {
    const tag = `v${version}`;
    const attempt = await watch("electron-release.yml", sha, `build/${tag}`, timeout, (jobs) =>
      requireJobs(jobs, ["prepare", "source-check", "mac", "windows", "promote"]),
    );
    const value = release(tag);
    const latest = baseline();
    if (
      !value ||
      value.draft !== false ||
      value.prerelease !== false ||
      value.id !== latest.id ||
      value.tag_name !== tag
    ) {
      throw new Error("Expected version is not the public latest stable release");
    }
    if (
      typeof value.body !== "string" ||
      !value.body.includes(notes) ||
      value.body.includes("Build in progress.")
    ) {
      throw new Error("Public release notes do not contain the reviewed CHANGELOG section");
    }
    const assets = pages(`releases/${value.id}/assets`);
    const manifests = Object.fromEntries(
      ["latest-mac.yml", "latest.yml"].map((name) => {
        const asset = assets.find((item) => item.name === name);
        if (!asset || !Number.isSafeInteger(asset.id)) throw new Error(`Missing ${name}`);
        return [
          name,
          request(`releases/assets/${asset.id}`, ["-H", "Accept: application/octet-stream"]),
        ];
      }),
    );
    validateAssets(assets, manifests);
    return { attempt, release: value };
  }
  return {
    baseline,
    release,
    noPendingRelease,
    watchCi: (sha, timeout) => watch("ci.yml", sha, "main", timeout, requireCiJobs),
    promotion,
  };
}

// Pure validation for the release train; no git or GitHub side effects.
export const REPOSITORY = "mxrsv/spacevibe-deck";
export const POLL_MS = 10_000;
export const CI_TIMEOUT_MS = 30 * 60_000;
export const RELEASE_TIMEOUT_MS = 45 * 60_000;
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
export const SHA = /^[0-9a-f]{40}$/u;

export function requireVersion(value) {
  if (typeof value !== "string" || !STABLE.test(value)) {
    throw new Error(`Expected a stable X.Y.Z version, received ${String(value)}`);
  }
  return value;
}

export function parseArguments(args) {
  let options = { dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      options = { ...options, dryRun: true };
    } else if (argument === "--backend-compatible") {
      options = { ...options, backendCompatible: true };
    } else if (argument === "--bump" || argument === "--resume" || argument === "--expect-sha") {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`Missing ${argument} value`);
      if (argument === "--bump" && !["patch", "minor"].includes(value)) {
        throw new Error("--bump must be patch or minor");
      }
      if ((argument === "--resume" || argument === "--expect-sha") && !SHA.test(value)) {
        throw new Error(`${argument} must be a full commit SHA`);
      }
      options = {
        ...options,
        [argument === "--expect-sha" ? "expectSha" : argument.slice(2)]: value,
      };
      index += 1;
    } else {
      throw new Error(`Unknown argument ${argument}`);
    }
  }
  if (options.resume && options.bump) throw new Error("Resume cannot bump again");
  if (options.resume && options.expectSha) throw new Error("Resume already names its commit");
  return options;
}

export function chooseVersion(current, commits, explicitBump) {
  requireVersion(current);
  if (commits.length === 0) throw new Error("No changes since the last stable release");
  const subjects = commits.map(({ subject, body }) => {
    if (/^[a-z]+(?:\([^\n)]+\))?!:/u.test(subject) || /^BREAKING[ -]CHANGE:/mu.test(body)) {
      throw new Error("Breaking change requires a separately approved major release");
    }
    return /^[a-z]+(?:\([^\n)]+\))?: .+/u.test(subject) ? subject.split(/[(:]/u)[0] : null;
  });
  if (
    !explicitBump &&
    (subjects.includes(null) || !subjects.some((s) => s === "feat" || s === "fix"))
  ) {
    throw new Error("Ambiguous or maintenance-only range; specify --bump patch|minor");
  }
  const bump = explicitBump ?? (subjects.includes("feat") ? "minor" : "patch");
  const [major, minor, patch] = current.split(".").map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) throw new Error("Version overflow");
  const next = bump === "minor" ? [major, minor + 1, 0] : [major, minor, patch + 1];
  if (!next.every(Number.isSafeInteger)) throw new Error("Version overflow");
  return next.join(".");
}

export function changelogSection(source, heading) {
  const lines = source.split(/\r?\n/u);
  const starts = lines.flatMap((line, index) => (line === `## ${heading}` ? [index] : []));
  if (starts.length !== 1) throw new Error(`Expected exactly one ## ${heading} heading`);
  const start = starts[0];
  const next = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const body = lines
    .slice(start + 1, next < 0 ? undefined : next)
    .join("\n")
    .trim();
  if (!body) throw new Error(`CHANGELOG.md section ## ${heading} is empty`);
  return { start, body };
}

export function cutChangelog(source, version) {
  requireVersion(version);
  const { start } = changelogSection(source, "Unreleased");
  if (/^## \d+\.\d+\.\d+$/mu.test(source.split(/\r?\n/u).slice(0, start).join("\n"))) {
    throw new Error("Unreleased must precede the published versions");
  }
  if (source.split(/\r?\n/u).includes(`## ${version}`))
    throw new Error("Target heading already exists");
  return source.replace(/^## Unreleased$/mu, `## ${version}`);
}

export function requireJobs(jobs, required, allowSkipped = []) {
  if (!Array.isArray(jobs)) throw new Error("Malformed workflow jobs response");
  for (const name of required) {
    const matches = jobs.filter((job) => job.name === name);
    if (matches.length !== 1 || matches[0].conclusion !== "success") {
      throw new Error(`Required job ${name} did not succeed`);
    }
  }
  for (const job of jobs) {
    if (
      job.conclusion !== "success" &&
      !(allowSkipped.includes(job.name) && job.conclusion === "skipped")
    ) {
      throw new Error(`Unexpected ${job.name} conclusion: ${job.conclusion}`);
    }
  }
}

export function requireCiJobs(jobs) {
  requireJobs(
    jobs,
    ["check", "backend-check"],
    ["windows-check", "windows-engineering-bundle", "windows-electron-package"],
  );
  for (const name of ["Test", "Build frontend"]) {
    const step = jobs.find((job) => job.name === "check").steps?.find((item) => item.name === name);
    if (step?.conclusion !== "success" || step.status !== "completed") {
      throw new Error(`CI check must actually execute ${name}`);
    }
  }
}

export function validateAssets(assets, manifests) {
  if (!Array.isArray(assets) || assets.some((asset) => typeof asset.name !== "string")) {
    throw new Error("Malformed release assets");
  }
  const names = assets.map(({ name }) => name);
  for (const pattern of [/\.dmg$/u, /-mac\.zip$/u, /-setup\.exe$/u]) {
    if (names.filter((name) => pattern.test(name)).length !== 1)
      throw new Error(`Expected one ${pattern} asset`);
  }
  for (const name of ["latest-mac.yml", "latest.yml"]) {
    if (names.filter((item) => item === name).length !== 1) throw new Error(`Missing ${name}`);
    const path = manifests[name]?.match(/^path: *['"]?([^'"\r\n]+?)['"]? *$/mu)?.[1];
    if (!path || !names.includes(path) || !names.includes(`${path}.blockmap`)) {
      throw new Error(`${name} must name a served payload and its exact blockmap`);
    }
  }
}

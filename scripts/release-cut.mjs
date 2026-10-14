/* oxlint-disable eslint/no-console -- release CLI output is its interface */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createGit } from "./release-cut-git.mjs";
import { createGithub } from "./release-cut-github.mjs";
import {
  CI_TIMEOUT_MS,
  RELEASE_TIMEOUT_MS,
  SHA,
  parseArguments,
  chooseVersion,
  requireVersion,
  cutChangelog,
  changelogSection,
} from "./release-cut-model.mjs";

const CUT_PATHS = ["package.json", "package-lock.json", "CHANGELOG.md"];
const COMMAND_TIMEOUT_MS = 120_000;

export function commandRunner(cwd) {
  return (command, args, { allowFailure = false } = {}) => {
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
    });
    if (result.error)
      throw new Error(`${command} ${args[0]}: ${result.error.message}`, { cause: result.error });
    if (allowFailure) return result;
    if (result.status !== 0)
      throw new Error(
        `${command} ${args[0]} failed: ${result.stderr.trim() || `exit ${result.status}`}`,
      );
    return result.stdout;
  };
}

function packageAt(git, revision) {
  return JSON.parse(git("show", `${revision}:package.json`));
}

function ensureNoOperation(git, cwd) {
  for (const name of ["rebase-merge", "rebase-apply", "sequencer"]) {
    if (existsSync(resolve(cwd, git("rev-parse", "--git-path", name)))) {
      throw new Error(`Unfinished git operation: ${name}`);
    }
  }
}

function proposedCut(g, github, options, original) {
  const baseline = github.baseline();
  const version = requireVersion(baseline.tag_name.slice(1));
  const base = g.git("rev-parse", "--verify", `${baseline.tag_name}^{commit}`);
  if (g.remoteRef(`refs/tags/${baseline.tag_name}`, { peel: true }) !== base)
    throw new Error("Baseline tag differs from remote");
  g.ancestor(base, original);
  if (packageAt(g.git, original).version !== version)
    throw new Error(
      "Package version differs from last promoted stable release; inspect/resume the existing cut",
    );
  const commits = g.commits(base, original);
  const payloadPaths = g.git(
    "diff",
    "--name-only",
    `${base}..${original}`,
    "--",
    "src/telemetry/payload.ts",
  );
  if (payloadPaths && !options.backendCompatible)
    throw new Error(
      "Telemetry payload changed; confirm backend compatibility with the owner, then pass --backend-compatible",
    );
  const next = chooseVersion(version, commits, options.bump);
  const changelog = g.fileAt(original, "CHANGELOG.md");
  const updatedNotes = cutChangelog(changelog, next);
  return {
    version: next,
    original,
    base,
    changelog: updatedNotes,
    notes: changelogSection(updatedNotes, next).body,
  };
}

function resumedCut(g, sha, requireHead = true) {
  if (!SHA.test(sha) || (requireHead && g.capture() !== sha))
    throw new Error("Resume requires HEAD at the full cut commit SHA");
  const version = requireVersion(packageAt(g.git, sha).version);
  if (g.git("show", "-s", "--format=%s", sha) !== `chore(release): cut ${version}`)
    throw new Error("Resume SHA is not a release-cut commit");
  const files = g.git("diff-tree", "--no-commit-id", "--name-only", "-r", sha).split("\n");
  if (files.length !== CUT_PATHS.length || files.some((path) => !CUT_PATHS.includes(path))) {
    throw new Error(
      "Resume commit must change only package.json, package-lock.json and CHANGELOG.md",
    );
  }
  const lock = JSON.parse(g.git("show", `${sha}:package-lock.json`));
  if (lock.version !== version || lock.packages?.[""]?.version !== version)
    throw new Error("Resume lockfile version mismatch");
  const parent = g.git("rev-parse", `${sha}^`);
  const parentPackage = packageAt(g.git, parent);
  const parentLock = JSON.parse(g.fileAt(parent, "package-lock.json"));
  const expectedLock = {
    ...parentLock,
    version,
    packages: { ...parentLock.packages, "": { ...parentLock.packages?.[""], version } },
  };
  if (
    JSON.stringify(packageAt(g.git, sha)) !== JSON.stringify({ ...parentPackage, version }) ||
    JSON.stringify(lock) !== JSON.stringify(expectedLock)
  ) {
    throw new Error("Cut commit contains unexpected package/lockfile changes");
  }
  const previous = requireVersion(packageAt(g.git, parent).version);
  if (previous === version) throw new Error("Resume commit did not bump its version");
  const changelog = g.fileAt(sha, "CHANGELOG.md");
  if (cutChangelog(g.fileAt(parent, "CHANGELOG.md"), version) !== changelog)
    throw new Error("Resume notes differ from the prepared cut");
  return { version, original: parent, changelog, notes: changelogSection(changelog, version).body };
}

function prepareFiles(cwd, cut) {
  const read = (path) => JSON.parse(readFileSync(resolve(cwd, path), "utf8"));
  const pkg = read("package.json");
  const lock = read("package-lock.json");
  if (
    !lock.packages?.[""] ||
    lock.version !== pkg.version ||
    lock.packages[""].version !== pkg.version
  ) {
    throw new Error("Current package-lock root versions are inconsistent");
  }
  const nextLock = {
    ...lock,
    version: cut.version,
    packages: { ...lock.packages, "": { ...lock.packages[""], version: cut.version } },
  };
  // No npm lifecycle scripts or implicit npm/git tag creation.
  writeFileSync(
    resolve(cwd, "package.json"),
    `${JSON.stringify({ ...pkg, version: cut.version }, null, 2)}\n`,
  );
  writeFileSync(resolve(cwd, "package-lock.json"), `${JSON.stringify(nextLock, null, 2)}\n`);
  writeFileSync(resolve(cwd, "CHANGELOG.md"), cut.changelog);
}

function commitCut(g, cut) {
  if (g.capture() !== cut.original)
    throw new Error("HEAD moved before editing; start over explicitly");
  const changed = g.git("diff", "--name-only").split("\n").filter(Boolean);
  if (changed.length !== CUT_PATHS.length || changed.some((path) => !CUT_PATHS.includes(path)))
    throw new Error("Unexpected release-cut diff");
  g.git("commit", "-m", `chore(release): cut ${cut.version}`, "--", ...CUT_PATHS);
  const sha = g.capture();
  g.clean();
  resumedCut(g, sha); // Also refuses unexpected hook changes inside the commit.
  return sha;
}

function ensureTargetAbsent(g, github, version) {
  for (const name of [`v${version}`, `build/v${version}`]) {
    if (g.localRef(`refs/tags/${name}`) || g.remoteRef(`refs/tags/${name}`))
      throw new Error(`Tag ${name} already exists`);
  }
  if (github.release(`v${version}`)) throw new Error(`Release v${version} already exists`);
}

function describeCut(g, options, original, cut, output) {
  const source = options.resume ?? original;
  output(
    `${options.dryRun ? "Dry run" : "Cut"}: ${cut.version}, source ${source}, trigger build/v${cut.version}`,
  );
  if (options.resume) {
    output("Resume: keep the existing version commit; revalidate refs, CI and promotion.");
  } else {
    output(
      `Baseline v${packageAt(g.git, cut.base).version} at ${cut.base}; range ${cut.base}..${original}; bump ${options.bump ?? "automatic fix/feature policy"}`,
    );
    output(
      "Actions: bump → CHANGELOG heading → scoped commit → main push → exact-SHA CI → trigger tag → promotion verification.",
    );
  }
  output(cut.notes);
}

async function pushAndTag(g, github, sha, version, output) {
  const tag = `build/v${version}`;
  const existingRemote = g.remoteRef(`refs/tags/${tag}`, { peel: true });
  if (existingRemote !== null) {
    if (existingRemote !== sha) throw new Error("Existing trigger tag points at another SHA");
    const remoteMain = g.remoteRef("refs/heads/main");
    g.ancestor(sha, remoteMain);
    return;
  }
  g.clean();
  if (g.capture() !== sha) throw new Error("HEAD moved during cut");
  const remoteMain = g.remoteRef("refs/heads/main");
  if (!remoteMain) throw new Error("Remote main is missing");
  g.ancestor(remoteMain, sha);
  if (remoteMain !== sha)
    g.git(
      "push",
      "--no-follow-tags",
      "--recurse-submodules=no",
      "origin",
      `${sha}:refs/heads/main`,
    );
  if (g.remoteRef("refs/heads/main") !== sha) throw new Error("Remote main moved after push");
  const ci = await github.watchCi(sha, CI_TIMEOUT_MS);
  output(`CI succeeded: ${ci.html_url}`);
  g.clean();
  if (g.capture() !== sha || g.remoteRef("refs/heads/main") !== sha)
    throw new Error("Main/HEAD advanced before tagging; recover explicitly");
  if (g.remoteRef(`refs/tags/v${version}`) || github.release(`v${version}`))
    throw new Error("Release target appeared before tagging");
  const local = g.localRef(`refs/tags/${tag}`);
  if (local !== null && local !== sha) throw new Error("Local trigger tag collision");
  if (!local) g.git("tag", tag, sha);
  g.git(
    "push",
    "--no-follow-tags",
    "--recurse-submodules=no",
    "origin",
    `refs/tags/${tag}:refs/tags/${tag}`,
  );
  if (g.remoteRef(`refs/tags/${tag}`, { peel: true }) !== sha)
    throw new Error("Remote trigger tag mismatch");
}

export async function runReleaseCut(
  args,
  {
    cwd = process.cwd(),
    run = commandRunner(cwd),
    output = console.log,
    github: injectedGithub,
  } = {},
) {
  const options = parseArguments(args);
  const g = createGit(run, cwd);
  const github = injectedGithub ?? createGithub(run);
  let releaseLock;
  let stage = "preflight";
  let source = options.resume;
  let version;
  try {
    g.preflight();
    ensureNoOperation(g.git, cwd);
    run("gh", ["auth", "status", "--hostname", "github.com"]);
    if (!options.dryRun) {
      releaseLock = g.acquireLock();
      g.git("fetch", "origin", "main", "--tags");
    }
    const original = g.capture();
    // The freeze: only the commit a preview build verified may be cut.
    if (options.expectSha && original !== options.expectSha)
      throw new Error(
        `HEAD ${original} is not the verified commit ${options.expectSha}; build a preview of HEAD, verify it, and pass its SHA`,
      );
    const remoteMain = g.remoteRef("refs/heads/main");
    if (!remoteMain) throw new Error("Remote main is missing");
    if (!options.resume) {
      g.ancestor(remoteMain, original);
      github.noPendingRelease();
    }
    stage = "prepare";
    const cut = options.resume
      ? resumedCut(g, options.resume, false)
      : proposedCut(g, github, options, original);
    if (options.resume && original !== options.resume) {
      if (g.remoteRef(`refs/tags/build/v${cut.version}`, { peel: true }) !== options.resume) {
        throw new Error("Resume at newer HEAD requires an existing immutable trigger");
      }
      g.ancestor(options.resume, original);
    }
    version = cut.version;
    if (!options.resume) ensureTargetAbsent(g, github, version);
    describeCut(g, options, original, cut, output);
    if (options.dryRun) return { version, dryRun: true };
    if (!options.resume) {
      g.clean();
      if (g.capture() !== original) throw new Error("HEAD moved before version edits");
      prepareFiles(cwd, cut);
      stage = "commit";
      source = commitCut(g, cut);
    }
    stage = "main push / exact-SHA CI / tag";
    await pushAndTag(g, github, source, version, output);
    stage = "promotion";
    const result = await github.promotion(source, version, RELEASE_TIMEOUT_MS, cut.notes);
    if (g.remoteRef(`refs/tags/v${version}`, { peel: true }) !== source)
      throw new Error("Public release tag does not match the cut SHA");
    output(
      `Promoted ${version} from ${source}\n${result.attempt.html_url}\n${result.release.html_url}`,
    );
    return { version, sha: source, ...result };
  } catch (error) {
    throw new Error(
      `Release cut stopped at ${stage}${version ? ` (${version})` : ""}${source ? `, SHA ${source}` : ""}: ${error.message}\nInspect: git status; gh run list --workflow ci.yml; gh run list --workflow electron-release.yml${source ? `\nResume after inspection: npm run release:cut -- --resume ${source}` : ""}\nNo automatic rollback, tag deletion or workflow retry was performed.`,
      { cause: error },
    );
  } finally {
    releaseLock?.();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReleaseCut(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

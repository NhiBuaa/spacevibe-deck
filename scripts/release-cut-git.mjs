import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { REPOSITORY, SHA } from "./release-cut-model.mjs";

export function createGit(run, cwd) {
  const git = (...args) => run("git", args).trim();
  const head = () => git("rev-parse", "HEAD");
  const fileAt = (revision, path) => run("git", ["show", `${revision}:${path}`]);
  function clean() {
    if (git("status", "--porcelain"))
      throw new Error("Release cut requires a clean tracked/untracked checkout and index");
  }
  function preflight() {
    if (git("symbolic-ref", "--short", "HEAD") !== "main")
      throw new Error("Release cut requires local main");
    clean();
    for (const ref of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
      const value = run("git", ["rev-parse", "--verify", "--quiet", ref], { allowFailure: true });
      if (value.status === 0) throw new Error(`Unfinished git operation: ${ref}`);
      if (value.status !== 1) throw new Error(`Could not inspect ${ref}`);
    }
    const origin = git("remote", "get-url", "--all", "origin");
    const allowed = [
      `https://github.com/${REPOSITORY}.git`,
      `https://github.com/${REPOSITORY}`,
      `git@github.com:${REPOSITORY}.git`,
      `ssh://git@github.com/${REPOSITORY}.git`,
    ];
    if (!allowed.includes(origin)) throw new Error(`origin must point at ${REPOSITORY}`);
    // A custom push URL must not send main/tags to a different repository.
    if (!allowed.includes(git("remote", "get-url", "--push", "--all", "origin")))
      throw new Error("Unexpected origin push URL");
  }
  function remoteRef(ref, { peel = false } = {}) {
    const lines = git("ls-remote", "origin", ref, ...(peel ? [`${ref}^{}`] : []))
      .split("\n")
      .filter(Boolean);
    if (lines.length === 0) return null;
    const records = lines.map((line) => line.split(/\s+/u));
    if (records.some(([sha]) => !SHA.test(sha))) throw new Error("Malformed remote ref response");
    const exact =
      records.find(([, name]) => name === (peel ? `${ref}^{}` : ref)) ??
      records.find(([, name]) => name === ref);
    if (!exact || records.length > (peel ? 2 : 1)) throw new Error("Ambiguous remote ref response");
    return exact[0];
  }
  function ancestor(before, after) {
    const result = run("git", ["merge-base", "--is-ancestor", before, after], {
      allowFailure: true,
    });
    if (result.status === 1) throw new Error(`${before} is not reachable from ${after}`);
    if (result.status !== 0) throw new Error(`Could not establish ancestry: ${result.stderr}`);
  }
  function capture() {
    const sha = head();
    if (!SHA.test(sha)) throw new Error("Invalid HEAD");
    return sha;
  }
  function acquireLock() {
    const common = resolve(cwd, git("rev-parse", "--git-common-dir"));
    const path = resolve(common, "deck-release-cut.lock");
    try {
      mkdirSync(path);
    } catch (error) {
      throw new Error(
        `Could not acquire release lock ${path}; inspect another cut or a stale lock`,
        { cause: error },
      );
    }
    return () => rmSync(path, { recursive: true });
  }
  function commits(base, tip) {
    const fields = git("log", "--format=%s%x00%B%x00", `${base}..${tip}`, "--").split("\0");
    return fields
      .slice(0, -1)
      .reduce(
        (result, field, index) =>
          index % 2 === 0
            ? [...result, { subject: field.trim(), body: fields[index + 1] }]
            : result,
        [],
      );
  }
  const localRef = (ref) => {
    const result = run("git", ["rev-parse", "--verify", "--quiet", ref], { allowFailure: true });
    if (result.status === 1) return null;
    if (result.status !== 0 || !SHA.test(result.stdout.trim()))
      throw new Error(`Could not read ${ref}`);
    return result.stdout.trim();
  };
  return {
    git,
    head,
    capture,
    clean,
    preflight,
    remoteRef,
    ancestor,
    acquireLock,
    commits,
    localRef,
    fileAt,
  };
}

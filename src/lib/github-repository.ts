/**
 * Parses what a user pastes into the Clone form: a `github.com` repository by
 * HTTPS URL, SSH URL, scp-style address or `owner/repo`. File, branch, PR,
 * issue and other deep links are rejected, not trimmed down to the repository:
 * the user asked for something this MVP will not clone.
 *
 * Pure and shared: the form previews the folder name with it and main re-parses
 * the same text before it spawns anything.
 */
export interface GithubRepository {
  readonly owner: string;
  readonly repo: string;
  /** The argv element handed to `git clone`; keeps the transport the user typed. */
  readonly remoteUrl: string;
  /** The default folder name. */
  readonly folderName: string;
}

const OWNER = /^[A-Za-z0-9-]+$/;
const REPO = /^[A-Za-z0-9_.-]+$/;

function withoutGitSuffix(repo: string): string {
  return repo.endsWith(".git") ? repo.slice(0, -4) : repo;
}

function build(owner: string, repoWithSuffix: string, remote: (path: string) => string) {
  const repo = withoutGitSuffix(repoWithSuffix);
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") {
    return null;
  }
  return { owner, repo, remoteUrl: remote(`${owner}/${repo}.git`), folderName: repo };
}

function pathSegments(path: string): string[] {
  return path.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
}

export function parseGithubRepository(input: string): GithubRepository | null {
  const text = input.trim();
  if (text === "" || /\s/.test(text)) {
    return null;
  }

  const scp = text.match(/^git@github\.com:(.+)$/i);
  if (scp !== null) {
    const parts = pathSegments(scp[1]);
    return parts.length === 2
      ? build(parts[0], parts[1], (path) => `git@github.com:${path}`)
      : null;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    const https = url.protocol === "https:" && url.username === "" && url.password === "";
    const ssh = url.protocol === "ssh:" && url.username === "git" && url.password === "";
    if (!(https || ssh) || url.hostname.toLowerCase() !== "github.com" || url.port !== "") {
      return null;
    }
    if (url.search !== "" || url.hash !== "") {
      return null;
    }
    const parts = pathSegments(url.pathname);
    if (parts.length !== 2) {
      return null;
    }
    return build(parts[0], parts[1], (path) =>
      https ? `https://github.com/${path}` : `ssh://git@github.com/${path}`,
    );
  }

  const short = text.split("/");
  return short.length === 2 && !text.includes(":")
    ? build(short[0], short[1], (path) => `https://github.com/${path}`)
    : null;
}

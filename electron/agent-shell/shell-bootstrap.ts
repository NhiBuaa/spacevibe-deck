/**
 * How a pane's shell starts so Deck's wrappers come first on `PATH` without
 * disturbing the user's own startup files (shell bootstrap and agent wrappers,
 * slice 1 of the agent-status queue). The approach is Superset's, with
 * `DECK_*` names:
 *
 * - zsh: `-l` with `ZDOTDIR` pointing at Deck's dotfiles. Each one sources the
 *   user's file of the same name, then hands startup back to the next Deck
 *   file. `.zshrc` and `.zlogin` add the bin directory and keep it from being
 *   rewritten away by a `precmd` hook.
 * - bash: `--rcfile` sourcing the login files itself, so it is not a login
 *   shell any more.
 * - fish: `-l --init-command` with a list-aware prepend.
 * - anything else: no bootstrap, `$SHELL -l` as before.
 *
 * Two deliberate departures from Superset's zsh files:
 * - After the user's file runs, the `ZDOTDIR` it left behind is remembered in
 *   `DECK_ORIG_ZDOTDIR`. A `.zshenv` that relocates the dotfiles (the XDG
 *   `~/.config/zsh` layout) therefore still reaches the user's real `.zshrc`.
 * - The shell never gets a readiness marker or a prompt; Deck reads its own.
 */
import os from "node:os";
import path from "node:path";
import { shellQuote } from "../agent-hooks/claude-hooks-file";

export const AGENT_SHELL_DIR = "agent-shell";

export interface AgentShellPaths {
  /** Directory holding the agent wrappers. */
  readonly binDir: string;
  readonly zshDir: string;
  readonly bashRcfile: string;
}

export interface BootstrapLaunch {
  readonly executable: string;
  readonly args: readonly string[];
  /** Added to the pane's environment; empty for shells that need none. */
  readonly env: Readonly<Record<string, string>>;
}

export function agentShellPaths(userDataDir: string): AgentShellPaths {
  const root = path.join(userDataDir, AGENT_SHELL_DIR);
  return {
    binDir: path.join(root, "bin"),
    zshDir: path.join(root, "zsh"),
    bashRcfile: path.join(root, "bash", "rcfile"),
  };
}

/** Name the user's shell by basename, `-zsh`-style dashes and all. */
function shellName(executable: string): string {
  return (executable.split("/").pop() ?? executable).replace(/^-+/, "");
}

// A rc file may unset or overwrite Deck's variables; the saved `export -p`
// lines put them back. zsh prints `export X=..`, bash `declare -x X=".."`.
const SAVE_ENV = `_deck_saved_env="$(export -p 2>/dev/null | grep -E '^(export|declare -x|typeset -x) DECK_')"`;
const RESTORE_ENV = `eval "$_deck_saved_env" 2>/dev/null || true`;

/** Idempotently prepend the bin directory to PATH (sh, zsh and bash). */
function prependBinFunction(binDir: string): string {
  const dir = shellQuote(binDir);
  return [
    "_deck_prepend_bin() {",
    '  case ":$PATH:" in',
    `    *:${dir}:*) ;;`,
    `    *) export PATH=${dir}:"$PATH" ;;`,
    "  esac",
    "}",
    "_deck_prepend_bin",
  ].join("\n");
}

/**
 * A zsh `precmd` hook re-adding the bin directory. mise, asdf and similar
 * rebuild PATH in their own `precmd`; ours stays last so it wins.
 */
function zshPrecmdHook(binDir: string): string {
  const dir = shellQuote(binDir);
  return [
    "typeset -ga precmd_functions 2>/dev/null || true",
    "_deck_ensure_path() {",
    '  case ":$PATH:" in',
    `    *:${dir}:*) ;;`,
    `    *) PATH=${dir}:"$PATH" ;;`,
    "  esac",
    "}",
    "{",
    "  precmd_functions=(${precmd_functions:#_deck_ensure_path} _deck_ensure_path)",
    "} 2>/dev/null || true",
  ].join("\n");
}

/**
 * One Deck stage of zsh's startup: run the user's file of the same name with
 * their `ZDOTDIR` in place, then put Deck's `ZDOTDIR` back so zsh continues
 * into Deck's next file. `after` runs once the user's variables are restored;
 * `last` leaves the user's `ZDOTDIR` in place instead (the final stage).
 */
function zshStage(
  file: string,
  zshDir: string,
  options: { after?: string; guard?: string; last?: boolean },
) {
  const { after, guard, last = false } = options;
  const userFile = `"$ZDOTDIR/${file}"`;
  const source = `[[ -f ${userFile} ]] && source ${userFile}`;
  return [
    `# SpaceVibe Deck zsh startup wrapper (${file}) - Deck-written, overwritten at launch.`,
    SAVE_ENV,
    // Empty or unset means the home directory, as in zsh itself.
    'export ZDOTDIR="${DECK_ORIG_ZDOTDIR:-$HOME}"',
    guard === undefined ? source : `if ${guard}; then\n  ${source}\nfi`,
    '_deck_user_zdotdir="${ZDOTDIR:-$HOME}"',
    RESTORE_ENV,
    'export DECK_ORIG_ZDOTDIR="$_deck_user_zdotdir"',
    ...(after === undefined ? [] : [after]),
    last ? 'export ZDOTDIR="$_deck_user_zdotdir"' : `export ZDOTDIR=${shellQuote(zshDir)}`,
    "unset _deck_saved_env _deck_user_zdotdir",
    "",
  ].join("\n");
}

/** Deck's four zsh dotfiles, keyed by file name. */
export function zshDotfiles(paths: AgentShellPaths): Record<string, string> {
  const dir = paths.zshDir;
  const repair = [
    zshPrecmdHook(paths.binDir),
    prependBinFunction(paths.binDir),
    "rehash 2>/dev/null || true",
  ].join("\n");
  return {
    ".zshenv": zshStage(".zshenv", dir, {}),
    ".zprofile": zshStage(".zprofile", dir, {}),
    ".zshrc": zshStage(".zshrc", dir, { after: repair }),
    ".zlogin": zshStage(".zlogin", dir, {
      after: repair,
      guard: "[[ -o interactive ]]",
      last: true,
    }),
  };
}

/** The bash `--rcfile`: what a login shell would read, then Deck's PATH. */
export function bashRcfile(paths: AgentShellPaths): string {
  return [
    "# SpaceVibe Deck bash rcfile - Deck-written, overwritten at launch.",
    SAVE_ENV,
    "[[ -f /etc/profile ]] && source /etc/profile",
    'if [[ -f "$HOME/.bash_profile" ]]; then',
    '  source "$HOME/.bash_profile"',
    'elif [[ -f "$HOME/.bash_login" ]]; then',
    '  source "$HOME/.bash_login"',
    'elif [[ -f "$HOME/.profile" ]]; then',
    '  source "$HOME/.profile"',
    "fi",
    '[[ -f "$HOME/.bashrc" ]] && source "$HOME/.bashrc"',
    RESTORE_ENV,
    prependBinFunction(paths.binDir),
    "hash -r 2>/dev/null || true",
    "unset _deck_saved_env",
    "",
  ].join("\n");
}

function escapeFishDoubleQuoted(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("$", "\\$");
}

function fishInitCommand(binDir: string): string {
  return [
    `set -l _deck_bin "${escapeFishDoubleQuoted(binDir)}"`,
    'contains -- "$_deck_bin" $PATH',
    'or set -gx PATH "$_deck_bin" $PATH',
  ].join("; ");
}

/**
 * Launch description for `shell` with Deck's bootstrap, or null when this
 * shell gets none and the caller should start `$SHELL -l` as before.
 * `baseEnv` is only read for `ZDOTDIR` and `HOME`.
 */
export function bootstrapLaunch(
  shell: string,
  paths: AgentShellPaths,
  baseEnv: NodeJS.ProcessEnv = process.env,
): BootstrapLaunch | null {
  switch (shellName(shell)) {
    case "zsh":
      return {
        executable: shell,
        args: ["-l"],
        env: {
          ZDOTDIR: paths.zshDir,
          DECK_ORIG_ZDOTDIR: baseEnv.ZDOTDIR || baseEnv.HOME || os.homedir(),
        },
      };
    case "bash":
      return { executable: shell, args: ["--rcfile", paths.bashRcfile], env: {} };
    case "fish":
      return {
        executable: shell,
        args: ["-l", "--init-command", fishInitCommand(paths.binDir)],
        env: {},
      };
    default:
      return null;
  }
}

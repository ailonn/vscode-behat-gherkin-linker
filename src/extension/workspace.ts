/**
 * Workspace path helpers — pure functions over path strings (no `vscode`),
 * unit-tested. Single source for the two rules every shell module needs:
 *
 * - the workspace-root-relative path carried by the core refs
 *   (forward slashes, undefined outside the workspace root);
 * - the always-excluded segments (`vendor/`, `node_modules/`) — matched as
 *   whole PATH SEGMENTS, never substrings (`vendoring/` is not excluded).
 *
 * Callers pass `uri.fsPath` (OS-native); the functions normalize both
 * slash directions.
 */

/**
 * Workspace-root-relative path (forward slashes) — the shape carried by the
 * core refs — or undefined when the file is not under the root. `""` for the
 * root itself (defensive; a file is never its own root).
 */
export function relativeToRoot(rootPath: string, filePath: string): string | undefined {
  const rootParts = split(normalize(rootPath));
  const fileParts = split(normalize(filePath));
  let i = 0;
  while (i < rootParts.length && i < fileParts.length && rootParts[i] === fileParts[i]) {
    i += 1;
  }
  if (i < rootParts.length) {
    // The file diverged before the root path completed (sibling, ancestor,
    // different tree) — outside the workspace root.
    return undefined;
  }
  return fileParts.slice(i).join("/");
}

/**
 * True when the path carries a `vendor` or `node_modules` SEGMENT (SPEC §5:
 * always excluded). Segment-exact on purpose: `myvendor/`, `vendoring/`
 * are legitimate project directories.
 */
export function isExcludedPath(filePath: string): boolean {
  return split(normalize(filePath)).some(
    (segment) => segment === "vendor" || segment === "node_modules"
  );
}

function normalize(path: string): string {
  return path.split("\\").join("/");
}

function split(path: string): string[] {
  return path.split("/");
}

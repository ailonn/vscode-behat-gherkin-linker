/**
 * Workspace path helpers (src/extension/workspace.ts) — the two rules every
 * shell module shares:
 * - relativeToRoot: the workspace-root-relative path carried by the core
 *   refs (forward slashes, undefined outside the root);
 * - isExcludedPath: the always-excluded segments (SPEC §5) — whole-path-
 *   segment match, never substring.
 *
 * Pure over path strings (no `vscode` import — the shell boundary is
 * preserved: these run where the core contract is checkable).
 */
import { describe, expect, it } from "vitest";
import { isExcludedPath, relativeToRoot } from "../../src/extension/workspace.js";

const ROOT = "/home/dev/workspace";

describe("relativeToRoot — the path shape carried by the core refs", () => {
  it("returns the root-relative path with forward slashes (nested)", () => {
    expect(relativeToRoot(ROOT, `${ROOT}/features/feature/a.feature`)).toBe(
      "features/feature/a.feature"
    );
  });

  it("returns a single-segment relative path (top-level file)", () => {
    expect(relativeToRoot(ROOT, `${ROOT}/CommandeSteps.php`)).toBe("CommandeSteps.php");
  });

  it("returns undefined for a sibling directory (not under the root)", () => {
    expect(relativeToRoot(ROOT, "/home/dev/other/a.feature")).toBeUndefined();
  });

  it("returns undefined for an ancestor of the root", () => {
    expect(relativeToRoot(ROOT, "/home/dev")).toBeUndefined();
  });

  it("returns undefined for a different tree entirely", () => {
    expect(relativeToRoot(ROOT, "/etc/hosts")).toBeUndefined();
  });

  it("normalizes backslashes (Windows fsPath)", () => {
    expect(relativeToRoot("C:\\ws", "C:\\ws\\features\\a.feature")).toBe(
      "features/a.feature"
    );
    expect(relativeToRoot("C:\\ws", "D:\\other\\a.feature")).toBeUndefined();
  });
});

describe("isExcludedPath — vendor/ and node_modules/ are SEGMENTS, not substrings (SPEC §5)", () => {
  it("excludes a file under vendor/ (any depth)", () => {
    expect(isExcludedPath(`${ROOT}/vendor/symfony/Step.php`)).toBe(true);
  });

  it("excludes a file under node_modules/ (any depth)", () => {
    expect(isExcludedPath(`${ROOT}/node_modules/.bin/x`)).toBe(true);
  });

  it("does NOT exclude a directory that merely contains the word (vendoring/)", () => {
    expect(isExcludedPath(`${ROOT}/vendoring/a.feature`)).toBe(false);
  });

  it("does NOT exclude myvendor/ or node_modules_extra/", () => {
    expect(isExcludedPath(`${ROOT}/myvendor/a.feature`)).toBe(false);
    expect(isExcludedPath(`${ROOT}/node_modules_extra/a.feature`)).toBe(false);
  });

  it("does NOT exclude ordinary project paths", () => {
    expect(isExcludedPath(`${ROOT}/src/Steps.php`)).toBe(false);
    expect(isExcludedPath(`${ROOT}/features/a.feature`)).toBe(false);
  });

  it("handles backslash paths (Windows fsPath)", () => {
    expect(isExcludedPath("C:\\ws\\vendor\\lib\\x.php")).toBe(true);
    expect(isExcludedPath("C:\\ws\\src\\x.php")).toBe(false);
  });
});

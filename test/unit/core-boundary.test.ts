/**
 * Architecture guard (SPEC.md §5, test strategy §7):
 * the functional core must have zero `vscode` imports — it is testable
 * without VS Code and without any runtime dependency on the editor.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CORE_DIR = join(import.meta.dirname, "..", "..", "src", "core");

function coreFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => join(dir, f));
}

describe("architecture guard — functional core", () => {
  it("has source files", () => {
    expect(coreFiles(CORE_DIR).length).toBeGreaterThan(0);
  });

  it("every core file has zero `vscode` imports", () => {
    for (const file of coreFiles(CORE_DIR)) {
      const source = readFileSync(file, "utf8");
      const rel = join("src", "core", file.split(CORE_DIR)[1].replace(/^\//, ""));
      expect(source, `${rel} must not import 'vscode' (static import)`).not.toMatch(
        /from\s+["']vscode["']/
      );
      expect(source, `${rel} must not import 'vscode' (dynamic import)`).not.toMatch(
        /import\(\s*["']vscode["']\s*\)/
      );
    }
  });
});

/**
 * Packaging contract lock (wave 3 — S1/S2 already delivered and accepted):
 * the pnpm pinning and vsce-ready invariants are invariants of the repo,
 * not a hope. A drift (a packageManager bump without the lockfile, the
 * strict-version combo weakened, a test/ fixture sneaking into the vsix,
 * personal data in the manifest) fails the fast unit loop.
 *
 * Contract-lock mode (test first green on the existing code — the accepted
 * behavior is frozen, not predicted): S1 (pnpm migration + toolchain
 * pinning) and S2 (vsce-ready manifest) are done; these tests lock their
 * observable invariants.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(import.meta.dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(REPO, rel), "utf8");
}

function pkg(): Record<string, unknown> {
  return JSON.parse(read("package.json")) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  expect(typeof value, "manifest field is an object").toBe("object");
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

describe("packaging contract — toolchain pinning (wave 3, S1)", () => {
  it("packageManager pins the exact pnpm version", () => {
    expect(pkg().packageManager).toBe("pnpm@10.33.2");
  });

  it(".nvmrc pins the node version the CI and dev use", () => {
    expect(read(".nvmrc").trim()).toBe("22.14.0");
  });

  it("engines declares the supported node range and the vscode engine", () => {
    const engines = asRecord(pkg().engines);
    expect(engines.node).toBe(">=20 <23");
    expect(engines.vscode).toBe("^1.90.0");
  });

  it(".npmrc makes a pnpm version mismatch fail loud (the verified S1 combo)", () => {
    const npmrc = read(".npmrc");
    expect(npmrc).toContain("manage-package-manager-versions=false");
    expect(npmrc).toContain("package-manager-strict-version=true");
  });

  it("the lockfile is pnpm's — no npm/yarn lockfile survives", () => {
    expect(existsSync(join(REPO, "pnpm-lock.yaml"))).toBe(true);
    expect(existsSync(join(REPO, "package-lock.json"))).toBe(false);
    expect(existsSync(join(REPO, "yarn.lock"))).toBe(false);
  });
});

describe("packaging contract — vsce-ready manifest (wave 3, S2)", () => {
  it("vscode:prepublish builds before any pack", () => {
    expect(pkg()["vscode:prepublish"]).toBe("pnpm run build");
  });

  it("repository and bugs point at the public GitHub repo", () => {
    const repository = asRecord(pkg().repository);
    expect(repository.url).toBe(
      "git+https://github.com/ailonn/vscode-behat-gherkin-linker.git"
    );
    const bugs = asRecord(pkg().bugs);
    expect(bugs.url).toBe(
      "https://github.com/ailonn/vscode-behat-gherkin-linker/issues"
    );
  });

  it("the identity is public: publisher, MIT license, version 0.1.0", () => {
    const p = pkg();
    expect(p.publisher).toBe("ailonn");
    expect(p.license).toBe("MIT");
    expect(p.version).toBe("0.1.0");
  });

  it("the manifest carries zero personal data", () => {
    expect(read("package.json")).not.toMatch(
      /matthieu|lauze|comwatt|protonmail|example\.com/i
    );
  });

  it(".vscodeignore keeps tests, fixtures, qa and specs out of the vsix", () => {
    const lines = read(".vscodeignore")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#"));
    for (const entry of [
      "test/",
      "features/",
      "qa/",
      "SPEC.md",
      ".github/",
      "pnpm-lock.yaml",
    ]) {
      expect(lines, `"${entry}" must be kept out of the vsix`).toContain(
        entry
      );
    }
  });
});

/**
 * `normalizeGlobs` (src/globs.ts) — the string|array → string[] normalization
 * of the `gherkinBehat.features` / `gherkinBehat.steps` settings, and
 * `normalizeExcludes` / `subtractExcluded` — the AC-9 exclude surface.
 */
import { describe, expect, it } from "vitest";
import {
  normalizeExcludes,
  normalizeGlobs,
  subtractExcluded,
} from "../../src/globs.js";

describe("normalizeGlobs", () => {
  it("keeps a single string as a one-glob array", () => {
    expect(normalizeGlobs("**/*.feature", "**/*.feature")).toEqual(["**/*.feature"]);
  });

  it("keeps an array of globs as-is", () => {
    expect(normalizeGlobs(["**/*.feature", "specs/**/*.feature"], "f")).toEqual([
      "**/*.feature",
      "specs/**/*.feature",
    ]);
  });

  it("wraps the fallback when the value is undefined", () => {
    expect(normalizeGlobs(undefined, "**/*.feature")).toEqual(["**/*.feature"]);
  });

  it("wraps the fallback for an empty string", () => {
    expect(normalizeGlobs("", "**/*.feature")).toEqual(["**/*.feature"]);
  });

  it("drops empty strings from an array", () => {
    expect(normalizeGlobs(["**/*.feature", "", "specs/**/*.feature"], "f")).toEqual([
      "**/*.feature",
      "specs/**/*.feature",
    ]);
  });

  it("drops non-string entries from an array (defensive)", () => {
    expect(normalizeGlobs(["**/*.feature", 42, null, "specs/**/*.feature"], "f")).toEqual([
      "**/*.feature",
      "specs/**/*.feature",
    ]);
  });

  it("keeps an empty array empty (explicit opt-out of globbing)", () => {
    expect(normalizeGlobs([], "f")).toEqual([]);
  });
});

describe("normalizeExcludes (AC-9 — dedicated normalization, default [])", () => {
  it("returns [] for undefined — the unset exclude excludes NOTHING (the normalizeGlobs trap: a fallback pattern would silently drop files)", () => {
    expect(normalizeExcludes(undefined)).toEqual([]);
  });

  it("returns [] for an empty string (same trap, explicit form)", () => {
    expect(normalizeExcludes("")).toEqual([]);
  });

  it("returns [] for null and non-string scalars (defensive — untrusted JSON)", () => {
    expect(normalizeExcludes(null)).toEqual([]);
    expect(normalizeExcludes(42)).toEqual([]);
  });

  it("returns [] for an empty array (explicit no-exclusion)", () => {
    expect(normalizeExcludes([])).toEqual([]);
  });

  it("keeps a single string as a one-glob array", () => {
    expect(normalizeExcludes("legacy/**")).toEqual(["legacy/**"]);
  });

  it("keeps an array of globs as-is", () => {
    expect(normalizeExcludes(["legacy/**", "old/**/*.feature"])).toEqual([
      "legacy/**",
      "old/**/*.feature",
    ]);
  });

  it("drops empty strings and non-string entries from an array (defensive)", () => {
    expect(normalizeExcludes(["legacy/**", "", 42, null, "old/**"])).toEqual([
      "legacy/**",
      "old/**",
    ]);
  });
});

describe("subtractExcluded (AC-9 — the set difference over the file paths)", () => {
  it("is the identity when nothing is excluded", () => {
    expect(subtractExcluded(["a.feature", "b.php"], [])).toEqual(["a.feature", "b.php"]);
  });

  it("removes the paths carried by an exclude set", () => {
    expect(subtractExcluded(["a.feature", "legacy/x.feature", "b.php"], ["legacy/x.feature"])).toEqual([
      "a.feature",
      "b.php",
    ]);
  });

  it("removes across the union of several exclude sets (one per user glob)", () => {
    expect(
      subtractExcluded(["a.feature", "legacy/x.feature", "old/y.php", "z.php"], [
        ["legacy/x.feature"],
        ["old/y.php"],
      ])
    ).toEqual(["a.feature", "z.php"]);
  });

  it("preserves the order of the included paths", () => {
    expect(subtractExcluded(["z.php", "a.feature", "m.php"], ["a.feature"])).toEqual([
      "z.php",
      "m.php",
    ]);
  });

  it("leaves duplicates of the included list to the caller (dedup is the shell's job)", () => {
    expect(subtractExcluded(["a.feature", "a.feature"], [])).toEqual(["a.feature", "a.feature"]);
  });

  it("removes everything when every path is excluded", () => {
    expect(subtractExcluded(["a.feature"], ["a.feature"])).toEqual([]);
  });
});

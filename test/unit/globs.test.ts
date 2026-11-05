/**
 * `normalizeGlobs` (src/globs.ts) — the string|array → string[] normalization
 * of the `gherkinBehat.features` / `gherkinBehat.steps` settings.
 */
import { describe, expect, it } from "vitest";
import { normalizeGlobs } from "../../src/globs.js";

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

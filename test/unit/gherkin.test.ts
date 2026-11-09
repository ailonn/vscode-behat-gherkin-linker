/**
 * Unit tests — `src/core/gherkin.ts` (SPEC.md §5 architecture, AC-6).
 *
 * The core function is PURE (no I/O): the tests read the fixtures via
 * `node:fs` and pass the *source* as a string — the file path is only carried
 * by the result.
 *
 * Rules covered (one rule = its tests):
 *  R1. Dialects via the official parser, zero hardcoded keywords (FR / EN / DE fixtures)
 *  R2. Default EN without a `# language:` header (the parser's official default)
 *  R3. Exact text: double quotes preserved, keyword normalized (no trailing space),
 *      1-based line
 *  R4. Scenario Outline = Examples interpolation BEFORE matching — no StepRef
 *      carries an unresolved `<placeholder>`
 *  R5. Unparseable Gherkin → error result with a readable reason, never an exception
 *  R6. `path` carried by every StepRef (and by the error result)
 */
import { dialects } from "@cucumber/gherkin";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFeature } from "../../src/core/gherkin.js";

const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures");

function fixtureSource(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

/**
 * Step keywords of a dialect — known to these tests only through the parser's
 * `dialects` table (R1: the core code must not know them either). The table
 * encodes the trailing space (word boundary); normalize both sides to compare
 * against the `StepRef` contract's normalized keyword.
 */
function dialectStepKeywords(language: string): string[] {
  const d = dialects[language];
  return [...d.given, ...d.when, ...d.then, ...d.and, ...d.but].map((k) => k.trimEnd());
}

const FR_PATH = "test/fixtures/commandes.feature";
const EN_PATH = "test/fixtures/orders_en.feature";
const DE_PATH = "test/fixtures/bestellungen_de.feature";
const EN_DEFAULT_PATH = "test/fixtures/orders_default_en.feature";

describe("R1 — dialects via the official parser, zero hardcoded keywords", () => {
  it("FR fixture (commandes.feature) parses to exactly the 6 expected StepRefs", async () => {
    const result = await parseFeature(fixtureSource("commandes.feature"), FR_PATH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.language).toBe("fr");
    expect(result.steps).toEqual([
      { path: FR_PATH, line: 5, keyword: "Soit", text: 'je suis "marie.dupont"' },
      { path: FR_PATH, line: 6, keyword: "Quand", text: 'je valide la commande "CMD-2026" avec succès' },
      { path: FR_PATH, line: 7, keyword: "Alors", text: 'la commande "CMD-2026" est valide' },
      { path: FR_PATH, line: 10, keyword: "Soit", text: 'la commande "CMD-1111" est valide' },
      { path: FR_PATH, line: 11, keyword: "Quand", text: 'je paie la commande "CMD-1111"' },
      { path: FR_PATH, line: 12, keyword: "Quand", text: 'je demande le remboursement "CMD-2026"' },
    ]);
  });

  it("FR keywords are members of the parser's FR dialect table (not known to the code)", async () => {
    const result = await parseFeature(fixtureSource("commandes.feature"), FR_PATH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const frKeywords = dialectStepKeywords("fr");
    for (const step of result.steps) {
      expect(frKeywords, `keyword "${step.keyword}" must come from the FR dialect table`).toContain(
        step.keyword,
      );
    }
  });

  it("DE fixture (bestellungen_de.feature) parses with the official DE keywords", async () => {
    const result = await parseFeature(fixtureSource("bestellungen_de.feature"), DE_PATH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.language).toBe("de");
    expect(result.steps).toEqual([
      { path: DE_PATH, line: 5, keyword: "Angenommen", text: 'ich bin "marie.dupont"' },
    ]);
    // R1 property again: the keyword is a member of the parser's DE dialect table.
    expect(dialectStepKeywords("de")).toContain(result.steps[0].keyword);
  });
});

describe("R2 — default EN without # language: header", () => {
  it("a header-less feature is parsed in English (parser's official default, AC-6)", async () => {
    const result = await parseFeature(fixtureSource("orders_default_en.feature"), EN_DEFAULT_PATH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.language).toBe("en");
    expect(result.steps).toEqual([
      { path: EN_DEFAULT_PATH, line: 4, keyword: "Given", text: 'I pay for "CMD-3000"' },
    ]);
  });
});

describe("R3 — exact text, normalized keyword, 1-based line", () => {
  it("double quotes are preserved in step text", async () => {
    const result = await parseFeature(fixtureSource("commandes.feature"), FR_PATH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const texts = result.steps.map((s) => s.text);
    expect(texts).toContain('je suis "marie.dupont"');
    expect(texts).toContain('je valide la commande "CMD-2026" avec succès');
    expect(texts).toContain('je demande le remboursement "CMD-2026"');
  });

  it("keywords are normalized (no trailing whitespace) and lines are 1-based", async () => {
    const fixtures: string[] = [
      "commandes.feature",
      "orders_en.feature",
      "bestellungen_de.feature",
      "orders_default_en.feature",
    ];
    for (const name of fixtures) {
      const result = await parseFeature(fixtureSource(name), name);
      expect(result.ok, name).toBe(true);
      if (!result.ok) continue;
      for (const step of result.steps) {
        expect(step.keyword, `${name}:${step.line}`).not.toMatch(/\s$/);
        expect(step.keyword, `${name}:${step.line}`).not.toHaveLength(0);
        expect(step.line, `${name}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("R4 — Scenario Outline: Examples interpolated BEFORE matching", () => {
  it("orders_en.feature yields exactly 3 StepRefs: 1 normal step + 1 step per Examples row", async () => {
    const result = await parseFeature(fixtureSource("orders_en.feature"), EN_PATH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.language).toBe("en");
    expect(result.steps).toHaveLength(3);
    // [line, keyword, text] — the outline step (line 8) is replaced by its
    // interpolated rows (lines 11 and 12 of the fixture).
    expect(result.steps.map((s) => [s.line, s.keyword, s.text])).toEqual([
      [5, "Given", 'I am "marie.dupont"'],
      [11, "When", 'I validate order "CMD-1"'],
      [12, "When", 'I validate order "CMD-2"'],
    ]);
  });

  it("interpolated rows carry the line of the Examples row, not the outline step line", async () => {
    const result = await parseFeature(fixtureSource("orders_en.feature"), EN_PATH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const outlineSteps = result.steps.filter((s) => s.line === 11 || s.line === 12);
    expect(outlineSteps).toHaveLength(2);
    expect(outlineSteps[0].keyword).toBe("When");
    expect(outlineSteps[1].keyword).toBe("When");
  });

  it("no StepRef carries an unresolved <order> placeholder (explicit assertion)", async () => {
    const result = await parseFeature(fixtureSource("orders_en.feature"), EN_PATH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.some((s) => s.text.includes("<order>"))).toBe(false);
    // The placeholder step line itself (line 8) produces no StepRef.
    expect(result.steps.some((s) => s.line === 8)).toBe(false);
  });
});

describe("R5 — unparseable Gherkin → error result, never an exception", () => {
  // NOTE: the invalid line must come AFTER a valid step — a non-keyword line
  // before any step is a valid scenario *description* (the parser grammar is
  // lenient there), so it would not produce a parse error.
  const BAD_KEYWORD_SOURCE = [
    "Feature: Broken",
    "",
    "  Scenario: Oops",
    "    Given a valid step",
    "    Toto je fais ceci",
  ].join("\n");

  it("an invalid step keyword yields an error result with a readable reason", async () => {
    const result = await parseFeature(BAD_KEYWORD_SOURCE, "test/fixtures/broken.feature");
    expect(result).toMatchObject({ ok: false, path: "test/fixtures/broken.feature" });
    if (result.ok) return;
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
    // The reason locates the offending line (line 5 of the source).
    expect(result.error).toMatch(/\(5:/);
  });

  it("an invalid keyword in description position (before any step) is valid grammar (lenient, locked)", async () => {
    // R5 lenient: a non-keyword line before any step is a scenario description
    // (the parser grammar is lenient there) — see the note above BAD_KEYWORD_SOURCE.
    const source = [
      "Feature: Lenient",
      "",
      "  Scenario: Description first",
      "    Toto n'est pas un mot-clé",
      "    Given a valid step",
    ].join("\n");
    const result = await parseFeature(source, "test/fixtures/lenient.feature");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.map((s) => [s.line, s.keyword, s.text])).toEqual([
      [5, "Given", "a valid step"],
    ]);
  });

  it("an unknown language yields an error result naming the language", async () => {
    const result = await parseFeature(
      "# language: zz\nFeature: Nothing\n",
      "test/fixtures/unknown-lang.feature",
    );
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.error).toContain("zz");
  });

  it("never throws, even on empty or nonsense input", async () => {
    await expect(parseFeature("", "empty.feature")).resolves.toMatchObject({ ok: true, steps: [] });
    await expect(parseFeature("just some words\n", "nonsense.feature")).resolves.toBeDefined();
  });
});

describe("R6 — path carried by every StepRef", () => {
  it("every StepRef of every fixture carries the given relative path", async () => {
    const fixtures: Array<[string, string]> = [
      ["commandes.feature", "features/commandes.feature"],
      ["orders_en.feature", "features/orders_en.feature"],
      ["bestellungen_de.feature", "features/bestellungen_de.feature"],
      ["orders_default_en.feature", "features/orders_default_en.feature"],
    ];
    for (const [name, path] of fixtures) {
      const result = await parseFeature(fixtureSource(name), path);
      expect(result.ok, name).toBe(true);
      if (!result.ok) continue;
      expect(result.steps.length, name).toBeGreaterThan(0);
      for (const step of result.steps) {
        expect(step.path, `${name}:${step.line}`).toBe(path);
      }
    }
  });

  it("the error result carries the given path", async () => {
    // Invalid keyword after a valid step (a non-keyword line before any step
    // would be a valid description, see R5 note).
    const result = await parseFeature("Feature: X\n  Scenario: Y\n    Given a step\n    Toto z\n", "x.feature");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.path).toBe("x.feature");
    }
  });
});

describe("Background — every Background step is a StepRef (declared design, locked)", () => {
  it("a Background's steps are indexed line by line, before the scenario steps", async () => {
    const source = [
      "# language: en",
      "Feature: With background",
      "",
      "  Background:",
      "    Given a context step",
      "",
      "  Scenario: S",
      "    When an action",
    ].join("\n");
    const result = await parseFeature(source, "test/fixtures/background.feature");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.map((s) => [s.line, s.keyword, s.text])).toEqual([
      [5, "Given", "a context step"],
      [8, "When", "an action"],
    ]);
  });
});

describe("R7 — scale: one scenario beyond the V8 argument limit (stress finding 2026-11-09)", () => {
  it("a single scenario with 200k steps parses to 200k StepRefs (no argument spread)", async () => {
    // The full-scale stress run found the collection path blowing the call
    // stack (`push(...steps)` — V8 argument limit) on a 1M-step feature.
    // This keeps the scenario→feature collection above the limit boundary
    // (65k–125k) in the fast loop: 200k steps in ONE scenario, parsed to
    // exactly 200k StepRefs.
    const n = 200_000;
    const source = [
      "Feature: Scale",
      "",
      "  Scenario: one huge scenario",
      ...Array.from({ length: n }, (_, i) => `    Given step ${i + 1}`),
    ].join("\n");
    const result = await parseFeature(source, "scale.feature");
    expect(result.ok, "the huge scenario parses (no RangeError)").toBe(true);
    if (!result.ok) return;
    expect(result.steps.length, "every step is a StepRef").toBe(n);
    expect(result.steps[n - 1].line, "1-based lines through the whole scenario").toBe(
      n + 3
    );
  });
});

/**
 * Index build + derived views (SPEC.md §5 — `index.ts`; AC-1, AC-2, AC-3, AC-5).
 *
 * The reference fixture (test/fixtures/) is a self-contained mini-project:
 * 5 features (12 steps) x 3 PHP files (9 definitions). Expected results
 * derived by hand under the Behat-exact semantics:
 * - 11 of the 12 steps resolve to exactly 1 definition
 * - `je demande le remboursement "CMD-2026"` (commandes.feature l.12) is
 *   the only undefined step
 * - `jeSuisLeClient` (CommandeSteps.php l.31) is the only orphan
 * - no duplicate pattern in the fixture (duplicates are tested against
 *   the in-memory world of features/diagnostics.feature)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFeature } from "../../src/core/gherkin.js";
import { scanPhp } from "../../src/core/php.js";
import {
  buildIndex,
  duplicateDefinitions,
  orphanedDefinitions,
  undefinedSteps,
} from "../../src/core/index.js";
import { definitionKey, stepKey } from "../../src/core/types.js";
import type { DefinitionRef, StepRef, StepType } from "../../src/core/types.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

// ---------------------------------------------------------------------------
// Reference fixture, loaded once (tests may do I/O — the core functions may not).
// ---------------------------------------------------------------------------

async function loadFixture(): Promise<{ steps: StepRef[]; definitions: DefinitionRef[] }> {
  const steps: StepRef[] = [];
  for (const f of readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".feature"))
    .sort()) {
    const r = await parseFeature(readFileSync(join(FIXTURES, f), "utf8"), `test/fixtures/${f}`);
    if (!r.ok) throw new Error(`fixture ${f} must parse: ${r.error}`);
    steps.push(...r.steps);
  }
  const definitions: DefinitionRef[] = [];
  for (const f of readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".php"))
    .sort()) {
    definitions.push(...scanPhp(readFileSync(join(FIXTURES, f), "utf8"), `test/fixtures/${f}`));
  }
  return { steps, definitions };
}

const fixture = await loadFixture();
const index = buildIndex(fixture.steps, fixture.definitions);

const distinct = (values: readonly string[]): number =>
  values.filter((v, i, a) => a.indexOf(v) === i).length;

describe("reference fixture — shape (AC-5 static indexing)", () => {
  it("indexes exactly 12 steps from 5 features and 9 definitions from 3 files", () => {
    expect(fixture.steps).toHaveLength(12);
    expect(distinct(fixture.steps.map((s) => s.path))).toBe(5);
    expect(fixture.definitions).toHaveLength(9);
    expect(distinct(fixture.definitions.map((d) => d.path))).toBe(3);
    expect(index.steps).toBe(fixture.steps);
    expect(index.definitions).toBe(fixture.definitions);
  });

  it("no definition is untranslatable in the reference fixture", () => {
    expect(index.untranslatable).toHaveLength(0);
  });

  it("AC-5: a workspace without any PHP definition still indexes (all steps undefined, no crash)", () => {
    const ix = buildIndex(fixture.steps, []);
    expect(ix.definitions).toHaveLength(0);
    expect(undefinedSteps(ix)).toHaveLength(12);
    expect(orphanedDefinitions(ix)).toHaveLength(0);
    expect(duplicateDefinitions(ix)).toHaveLength(0);
  });
});

describe("forward resolution feature -> definition (AC-1)", () => {
  it("resolves 11 of the 12 steps, each to exactly 1 definition", () => {
    const resolved = [...index.stepToDefinitions.values()].filter((defs) => defs.length > 0);
    expect(resolved).toHaveLength(11);
    for (const defs of resolved) expect(defs).toHaveLength(1);
  });

  it("resolves the unanchored suffix case: 'avec succes' does not block the match", () => {
    const step = fixture.steps.find(
      (s) => s.text === 'je valide la commande "CMD-2026" avec succès'
    );
    expect(step).toBeDefined();
    const defs = index.stepToDefinitions.get(stepKey(step!))!;
    expect(defs).toHaveLength(1);
    expect(defs[0].method).toBe("laCommandeValidee");
    expect(defs[0].type).toBe("When");
  });

  it("resolves the :param step to jePaie (transform carried, never evaluated)", () => {
    const step = fixture.steps.find((s) => s.text === 'je paie la commande "CMD-1111"');
    expect(step).toBeDefined();
    const defs = index.stepToDefinitions.get(stepKey(step!))!;
    expect(defs).toHaveLength(1);
    expect(defs[0].method).toBe("jePaie");
    expect(defs[0].transform).toBe("App\\Behat\\Transforms\\CommandeNumero");
  });

  it("does not cross-match: 'je suis' never matches 'je suis le client'", () => {
    const step = fixture.steps.find((s) => s.text === 'je suis "marie.dupont"');
    expect(step).toBeDefined();
    const defs = index.stepToDefinitions.get(stepKey(step!))!;
    expect(defs.map((d) => d.method)).toEqual(["jeSuis"]);
  });

  it("does not cross-match: the @Then pattern does not match the 'avec succes' step", () => {
    const step = fixture.steps.find(
      (s) => s.text === 'je valide la commande "CMD-2026" avec succès'
    );
    expect(step).toBeDefined();
    const defs = index.stepToDefinitions.get(stepKey(step!))!;
    expect(defs.map((d) => d.type)).not.toContain("Then");
  });

  it("matching is type-agnostic: a 'Soit' step matches its definition without any type filter", () => {
    // `Soit la commande "CMD-1111" est valide` (commandes.feature l.10) matches
    // the @Then definition purely on the pattern — no Given/When/Then involved.
    const step = fixture.steps.find((s) => s.text === 'la commande "CMD-1111" est valide');
    expect(step).toBeDefined();
    const defs = index.stepToDefinitions.get(stepKey(step!))!;
    expect(defs.map((d) => d.method)).toEqual(["laCommandeValidee"]);
  });
});

describe("reverse resolution definition -> usages (AC-2)", () => {
  it("the @When definition has exactly 2 usages (CMD-2026 with suffix + CMD-9999)", () => {
    const def = fixture.definitions.find(
      (d) => d.method === "laCommandeValidee" && d.type === "When"
    );
    expect(def).toBeDefined();
    const usages = index.definitionToSteps.get(definitionKey(def!))!;
    expect(usages.map((s) => s.text)).toEqual([
      'je valide la commande "CMD-2026" avec succès',
      'je valide la commande "CMD-9999"',
    ]);
  });

  it("the two Scenario Outline rows each resolve to iValidateOrder (2 usages)", () => {
    const def = fixture.definitions.find((d) => d.method === "iValidateOrder");
    expect(def).toBeDefined();
    const usages = index.definitionToSteps.get(definitionKey(def!))!;
    expect(usages.map((s) => s.text)).toEqual(['I validate order "CMD-1"', 'I validate order "CMD-2"']);
  });

  it("total match pairs = 11 (12 steps - 1 undefined)", () => {
    let pairs = 0;
    for (const defs of index.stepToDefinitions.values()) pairs += defs.length;
    expect(pairs).toBe(11);
  });
});

describe("derived views on the reference fixture (AC-3)", () => {
  it("undefined: exactly the remboursement step", () => {
    const u = undefinedSteps(index);
    expect(u).toHaveLength(1);
    expect(u[0].text).toBe('je demande le remboursement "CMD-2026"');
    expect(u[0].path).toBe("test/fixtures/commandes.feature");
    expect(u[0].line).toBe(12);
  });

  it("orphan: exactly jeSuisLeClient (no step says 'je suis le client')", () => {
    const o = orphanedDefinitions(index);
    expect(o).toHaveLength(1);
    expect(o[0].method).toBe("jeSuisLeClient");
    expect(o[0].line).toBe(31);
  });

  it("duplicate: none in the reference fixture", () => {
    expect(duplicateDefinitions(index)).toHaveLength(0);
  });
});

describe("diagnostics world — features/diagnostics.feature scenario, in memory (AC-3)", () => {
  const IDENTICAL = '/je valide la commande "(?P<numero>[\\w.-]+)"/';
  const NEAR = '/je valide la commande "(?P<numero>[\\w-]+)"/';

  const def = (
    method: string,
    type: StepType,
    expression: string,
    line: number
  ): DefinitionRef => ({
    path: "test/fixtures/DiagnosticSteps.php",
    line,
    fqcn: "App\\Behat\\DiagnosticSteps",
    method,
    parameters: method === "jeSuisLeClient" ? ["login"] : ["numero"],
    type,
    expression,
  });

  const definitions: DefinitionRef[] = [
    def("valideA", "When", IDENTICAL, 5),
    def("valideB", "When", IDENTICAL, 10),
    def("valideC", "When", NEAR, 15),
    def("valideD", "Then", IDENTICAL, 20),
    def("jeSuisLeClient", "Given", '/je suis le client "(?P<login>[\\w.]+)"/', 25),
  ];

  const step = (text: string, line: number): StepRef => ({
    path: "test/fixtures/diagnostic.feature",
    line,
    keyword: "Quand",
    text,
  });

  const steps: StepRef[] = [
    step('je valide la commande "CMD-2026"', 4),
    step('je demande le remboursement "CMD-2026"', 5),
  ];

  const di = buildIndex(steps, definitions);

  it("duplicate: the 3 strictly-identical-pattern definitions form ONE group, regardless of annotation type", () => {
    const groups = duplicateDefinitions(di);
    expect(groups).toHaveLength(1);
    expect(groups[0].expression).toBe(IDENTICAL);
    expect(groups[0].definitions.map((d) => d.method).sort()).toEqual([
      "valideA",
      "valideB",
      "valideD",
    ]);
  });

  it("duplicate: the near-identical pattern (valideC, no dot) is NOT in the group", () => {
    for (const g of duplicateDefinitions(di)) {
      expect(g.definitions.some((d) => d.method === "valideC")).toBe(false);
    }
  });

  it("ambiguity visible in the forward map: the matched step resolves to 4 definitions (A, B, C, D all match CMD-2026)", () => {
    const defs = di.stepToDefinitions.get(stepKey(steps[0]))!;
    expect(defs.map((d) => d.method).sort()).toEqual(["valideA", "valideB", "valideC", "valideD"]);
  });

  it("undefined: the remboursement step (error candidate)", () => {
    const u = undefinedSteps(di);
    expect(u).toHaveLength(1);
    expect(u[0].text).toBe('je demande le remboursement "CMD-2026"');
  });

  it("orphan: jeSuisLeClient only (info candidate)", () => {
    expect(orphanedDefinitions(di).map((d) => d.method)).toEqual(["jeSuisLeClient"]);
  });
});

describe("untranslatable definitions (fail loud — SPEC §5)", () => {
  it("is carried in index.untranslatable, never matched, and is an orphan", () => {
    const definitions: DefinitionRef[] = [
      { path: "t.php", line: 5, fqcn: "A\\B", method: "mK", parameters: [], type: "When", expression: "/\\Kfoo bar/" },
      { path: "t.php", line: 10, fqcn: "A\\B", method: "mOk", parameters: ["x"], type: "When", expression: '/foo "(?P<x>\\d+)"/' },
    ];
    const steps: StepRef[] = [
      { path: "t.feature", line: 3, keyword: "Quand", text: 'foo "42"' },
      { path: "t.feature", line: 4, keyword: "Quand", text: "foo bar" },
    ];
    const ix = buildIndex(steps, definitions);

    expect(ix.untranslatable).toHaveLength(1);
    expect(ix.untranslatable[0].definition.method).toBe("mK");
    expect(ix.untranslatable[0].reason).toBeTruthy();

    // the step whose text the untranslatable expression would match resolves to NOTHING
    expect(ix.stepToDefinitions.get(stepKey(steps[1]))).toEqual([]);
    // the valid definition still matches its step
    expect(ix.stepToDefinitions.get(stepKey(steps[0]))!.map((d) => d.method)).toEqual(["mOk"]);
    // untranslatable definitions never match -> they are orphans
    expect(orphanedDefinitions(ix).map((d) => d.method)).toEqual(["mK"]);
  });
});

describe("budget (SPEC §5 — wall-time < 500 ms on the reference fixture)", () => {
  it("buildIndex(12 steps x 9 definitions, 5 features) < 500 ms", () => {
    const t0 = performance.now();
    buildIndex(fixture.steps, fixture.definitions);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

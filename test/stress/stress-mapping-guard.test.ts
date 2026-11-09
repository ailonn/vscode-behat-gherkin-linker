/**
 * Mapping guard (B.2, PO decision 2026-11-09) — the `CA-n: <scenario title>`
 * test-name convention is an **invariant of the suite**, not a hope:
 *
 *  a. every CA of the spec has at least one test named `CA-n: <title>`
 *     (title verbatim from stress-spec.md §2);
 *  b. no dead `CA-n:` test name survives (a CA that no longer exists in the spec);
 *  c. no title drift (a test title differing from the spec's scenario title).
 *
 * Stdlib of the existing test framework (vitest + node:fs) — no dependency.
 * The e2e suites (suite-stress.mjs / suite-stress-restart.mjs) carry the CA-4/5/6
 * tests and are scanned the same way.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const STRESS_DIR = import.meta.dirname;
const SPEC = join(STRESS_DIR, "stress-spec.md");
const E2E_SUITES = ["suite-stress.mjs", "suite-stress-restart.mjs"];

/**
 * The CA → canonical title map, read from the spec: each `### CA-n — …`
 * section carries its Gherkin scenario, and the **Scenario title** (not the
 * section heading) is the canonical anchor of the test name (spec §2).
 */
function specCas(): Map<string, string> {
  const spec = readFileSync(SPEC, "utf8");
  const cas = new Map<string, string>();
  for (const m of spec.matchAll(
    /^### (CA-\d+) — [^\n]+\n\n```gherkin\nScenario: ([^\n]+)/gm,
  )) {
    cas.set(m[1], m[2].trim());
  }
  return cas;
}

function scannedFiles(): string[] {
  const files = readdirSync(STRESS_DIR)
    .filter((f) => f.endsWith(".test.ts") && f !== "stress-mapping-guard.test.ts")
    .map((f) => join(STRESS_DIR, f));
  files.push(...E2E_SUITES.map((f) => join(STRESS_DIR, f)));
  return files;
}

function testNames(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const names: string[] = [];
  for (const m of source.matchAll(/\bit\(\s*["'`]([^"'`]+)["'`]/g)) names.push(m[1]);
  for (const m of source.matchAll(/\btest\(\s*["'`]([^"'`]+)["'`]/g)) names.push(m[1]);
  return names;
}

describe("mapping guard — CA ↔ test names (B.2)", () => {
  it("the spec carries the full CA set CA-1..CA-8", () => {
    expect([...specCas().keys()].sort()).toEqual([
      "CA-1",
      "CA-2",
      "CA-3",
      "CA-4",
      "CA-5",
      "CA-6",
      "CA-7",
      "CA-8",
    ]);
  });

  it("every CA has at least one test named CA-n: <scenario title> (title verbatim)", () => {
    const cas = specCas();
    const all = scannedFiles().flatMap(testNames);
    for (const [ca, title] of cas) {
      const expected = `${ca}: ${title}`;
      expect(
        all.filter((n) => n === expected).length,
        `a test named exactly "${expected}" exists`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("no dead CA-n: test name and no title drift from the spec", () => {
    const cas = specCas();
    const all = scannedFiles().flatMap(testNames);
    const caNames = all.filter((n) => /^CA-\d+: /.test(n));
    expect(caNames.length, "CA-named tests exist in the scanned files").toBeGreaterThan(0);
    for (const name of caNames) {
      const ca = name.slice(0, name.indexOf(":"));
      expect(cas.has(ca), `"${name}" — no ${ca} in the spec (dead name)`).toBe(true);
      if (cas.has(ca)) {
        expect(name, `"${name}" — title drifted from the spec`).toBe(`${ca}: ${cas.get(ca)}`);
      }
    }
  });
});

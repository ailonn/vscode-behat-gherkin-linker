/**
 * Stress generator invariants — the spec CA at small scale (10 × 10) in the fast
 * vitest loop (stress-spec.md §2 + §3 `vehicle`).
 *
 * The test name is `CA-n: <scenario title>` — the title is verbatim from
 * stress-spec.md §2 (mapping rule B.2, enforced by stress-mapping-guard.test.ts).
 *
 * Small scale keeps the loop fast: the matching invariants (CA-3) hold at every
 * scale (v = (s × M + j) mod 100 spreads the steps over the 100 definitions),
 * and at 10 × 10 each of the 100 definitions matches exactly one step.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateMessages } from "@cucumber/gherkin";
import { IdGenerator, SourceMediaType } from "@cucumber/messages";
import { describe, expect, it } from "vitest";
import {
  buildIndex,
  duplicateDefinitions,
  orphanedDefinitions,
  undefinedSteps,
} from "../../src/core/index.js";
import { parseFeature } from "../../src/core/gherkin.js";
import { scanPhp } from "../../src/core/php.js";
import { stepKey } from "../../src/core/types.js";

const REPO = join(import.meta.dirname, "..", "..");
const GENERATOR = join(import.meta.dirname, "generate-stress.mjs");

/** Run the generator CLI (spawn — the stdlib-only guarantee is CA-7 itself). */
function runGenerator(args: string[], out: string): void {
  const res = spawnSync(process.execPath, [GENERATOR, ...args, "--out", out], {
    encoding: "utf8",
  });
  expect(
    res.status,
    `generator exited ${res.status}: ${res.stderr ?? ""}${res.stdout ?? ""}`,
  ).toBe(0);
}

/** Isolated output directory (fixtures are tmp — the generated/ dir is for e2e). */
function freshDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Count the scenarios of the feature through the official parser AST. */
function scenarioCount(source: string): number {
  const envelopes = generateMessages(
    source,
    "stress.feature",
    SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
    {
      includeGherkinDocument: true,
      includePickles: false,
      newId: IdGenerator.incrementing(),
    },
  );
  const doc = envelopes.find((e) => e.gherkinDocument !== undefined)?.gherkinDocument;
  let n = 0;
  for (const child of doc?.feature?.children ?? []) {
    if (child.scenario) n += 1;
    if (child.rule) n += child.rule.children.filter((rc) => rc.scenario).length;
  }
  return n;
}

describe("stress generator — spec CA (small scale 10 x 10)", () => {
  it("CA-1: The same (scenarios, steps, seed) produces byte-identical files", () => {
    const dirA = freshDir("stress-ca1-a-");
    const dirB = freshDir("stress-ca1-b-");
    const dirC = freshDir("stress-ca1-c-");
    try {
      runGenerator(["--scenarios", "10", "--steps", "10", "--seed", "42"], dirA);
      runGenerator(["--scenarios", "10", "--steps", "10", "--seed", "42"], dirB);
      const filesA = readdirSync(dirA).sort();
      const filesB = readdirSync(dirB).sort();
      expect(filesA.length, "the generator produces files").toBeGreaterThan(0);
      expect(filesA).toEqual(filesB);
      for (const f of filesA) {
        expect(
          readFileSync(join(dirA, f)),
          `${f} byte-identical for the same (scenarios, steps, seed)`,
        ).toEqual(readFileSync(join(dirB, f)));
      }
      // The seed is a real function input: a different seed shifts the keyword
      // rotation ((j + seed mod 3) mod 3) and the bytes differ.
      runGenerator(["--scenarios", "10", "--steps", "10", "--seed", "43"], dirC);
      expect(
        readFileSync(join(dirA, "stress.feature")).equals(
          readFileSync(join(dirC, "stress.feature")),
        ),
        "a different seed produces different bytes (the seed acts on the output)",
      ).toBe(false);
    } finally {
      for (const d of [dirA, dirB, dirC]) rmSync(d, { recursive: true, force: true });
    }
  });

  it("CA-2: The generated workspace carries exactly N scenarios, N x M steps and 100 definitions", async () => {
    const dir = freshDir("stress-ca2-");
    try {
      runGenerator(["--scenarios", "10", "--steps", "10"], dir);
      const source = readFileSync(join(dir, "stress.feature"), "utf8");
      expect(scenarioCount(source), "the feature carries exactly 10 scenarios").toBe(10);
      const parsed = await parseFeature(source, "stress.feature");
      expect(parsed.ok, "the generated .feature parses (ok result)").toBe(true);
      if (!parsed.ok) return;
      expect(parsed.steps.length, "the feature carries exactly 10 x 10 steps").toBe(100);
      const defs = scanPhp(
        readFileSync(join(dir, "StressContext.php"), "utf8"),
        "StressContext.php",
      );
      expect(defs.length, "the PHP context carries exactly 100 definitions").toBe(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CA-3: Every generated step matches exactly one generated definition", async () => {
    const dir = freshDir("stress-ca3-");
    try {
      runGenerator(["--scenarios", "10", "--steps", "10"], dir);
      const parsed = await parseFeature(
        readFileSync(join(dir, "stress.feature"), "utf8"),
        "stress.feature",
      );
      expect(parsed.ok, "the generated .feature parses").toBe(true);
      if (!parsed.ok) return;
      const defs = scanPhp(
        readFileSync(join(dir, "StressContext.php"), "utf8"),
        "StressContext.php",
      );
      const index = buildIndex(parsed.steps, defs);
      for (const step of parsed.steps) {
        const hit = index.stepToDefinitions.get(stepKey(step))?.length;
        expect(hit, `step line ${step.line} matches exactly one definition`).toBe(1);
      }
      expect(undefinedSteps(index).length, "no undefined step").toBe(0);
      expect(orphanedDefinitions(index).length, "no orphan definition").toBe(0);
      expect(duplicateDefinitions(index).length, "no duplicate group").toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CA-7: The generator uses Node stdlib only and adds no runtime dependency", () => {
    const source = readFileSync(GENERATOR, "utf8");
    const imports = [
      ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    expect(imports.length, "the generator has import statements").toBeGreaterThan(0);
    for (const mod of imports) {
      expect(
        mod.startsWith("node:") || mod.startsWith("."),
        `the import "${mod}" is a Node builtin or a relative file`,
      ).toBe(true);
    }
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      "@cucumber/gherkin",
      "@cucumber/messages",
    ]);
  });

  it("CA-8: The generated content is deterministic English boilerplate with zero personal data", () => {
    const dir = freshDir("stress-ca8-");
    try {
      runGenerator(["--scenarios", "10", "--steps", "10"], dir);
      const feature = readFileSync(join(dir, "stress.feature"), "utf8");
      const php = readFileSync(join(dir, "StressContext.php"), "utf8");
      for (const line of feature.split("\n")) {
        expect(
          line === "" ||
            line === "Feature: Stress 10 by 10" ||
            /^  Scenario: scenario \d+$/.test(line) ||
            /^  (Given|When|Then) step \d+ of scenario \d+ variant \d+$/.test(line),
          `boilerplate feature line: ${JSON.stringify(line)}`,
        ).toBe(true);
      }
      for (const line of php.split("\n")) {
        expect(
          line === "" ||
            line === "<?php" ||
            line === "class StressContext" ||
            line === "{" ||
            line === "}" ||
            line === "    /**" ||
            line === "     */" ||
            line === "    {" ||
            line === "    }" ||
            /^     \* @Given \/step \(\?P<j>\\d\+\) of scenario \\d\+ variant \d+\$\/$/
              .test(line) ||
            /^    public function step\d+\(\$j\)$/.test(line),
          `boilerplate PHP line: ${JSON.stringify(line)}`,
        ).toBe(true);
      }
      const both = feature + php;
      expect(/[^\x20-\x7E\n]/.test(both), "pure ASCII (no accents, no non-ASCII)").toBe(false);
      expect(
        both,
        "no personal data marker",
      ).not.toMatch(/matthieu|lauze|comwatt|ailonn|protonmail|@example\.com/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CLI: a failed intent is announced with the reason (explicit stderr + exit 1)", () => {
    const badValue = spawnSync(process.execPath, [GENERATOR, "--scenarios", "abc"], {
      encoding: "utf8",
    });
    expect(badValue.status, "invalid value → exit 1").toBe(1);
    expect(badValue.stderr, "the reason names the flag").toContain(
      "--scenarios must be a non-negative integer",
    );
    const unknown = spawnSync(process.execPath, [GENERATOR, "--bogus"], {
      encoding: "utf8",
    });
    expect(unknown.status, "unknown argument → exit 1").toBe(1);
    expect(unknown.stderr, "the reason names the argument").toContain(
      'unknown argument "--bogus"',
    );
    const help = spawnSync(process.execPath, [GENERATOR, "--help"], {
      encoding: "utf8",
    });
    expect(help.status, "--help → exit 0").toBe(0);
    expect(help.stdout).toContain("Usage:");
  });
});

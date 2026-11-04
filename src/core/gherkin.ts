/**
 * Gherkin core — thin wrapper over the official `@cucumber/gherkin` parser
 * (SPEC.md §5 "gherkin.ts", AC-6).
 *
 * Pure: no `vscode` import, no I/O, no clock, no randomness. The shell reads
 * the file and passes the source here; `path` is only carried by the result.
 *
 * Dialects come from the parser itself (its `dialects` table, applied through
 * the `# language:` header or the official EN default) — this module knows
 * no keyword: whatever the AST reports is what the dialect table said.
 *
 * Empirical notes on the AST (verified against @cucumber/gherkin@42.0.1):
 * - `Step.keyword` is the dialect keyword **with its trailing space** (e.g.
 *   `"Soit "`, `"When "`) — the dialect table encodes the trailing space to
 *   enforce the word boundary. The core normalizes it (`trimEnd`) to match
 *   the frozen `StepRef` contract ("keyword as written, no trailing space");
 *   `Step.text` is the rest of the line, trimmed, with double quotes preserved.
 * - `Location.line` is 1-based everywhere (steps, table rows).
 * - Scenario Outline: `Scenario.steps` keeps the placeholder text (e.g.
 *   `I validate order "<order>"`) at the step's own line; each
 *   `Scenario.examples[].tableBody` row carries its own `location.line` —
 *   the line of the Examples row. We emit one StepRef per (step × row) at
 *   the row's line with the text interpolated; the placeholder step line
 *   itself produces no StepRef (interpolation BEFORE matching, as in the
 *   Behat runtime).
 * - Parser errors come back as `parseError` envelopes whose message already
 *   carries `(line:column): reason`; only unexpected errors without a
 *   location are thrown by `generateMessages` — caught defensively below.
 */
import { generateMessages } from "@cucumber/gherkin";
import { IdGenerator, SourceMediaType } from "@cucumber/messages";
import type {
  Background,
  Envelope,
  GherkinDocument,
  Rule,
  Scenario,
  Step,
} from "@cucumber/messages";
import type { StepRef } from "./types.js";

/**
 * Result of parsing one feature source — a discriminated union so the shell
 * distinguishes "feature analysable" from "feature non analysable" without
 * any exception: `ok: false` becomes a diagnostic, never a crash.
 */
export type ParsedFeature =
  | {
      readonly ok: true;
      readonly path: string;
      /** Dialect in effect ("fr", "en", …) — absent when no `Feature:` line exists. */
      readonly language?: string;
      readonly steps: readonly StepRef[];
    }
  | { readonly ok: false; readonly path: string; readonly error: string };

/**
 * Parse a feature source into `StepRef[]` (Scenario Outlines interpolated
 * before matching). Pure: `source` is the file content, `path` is the
 * relative path to carry on every `StepRef`.
 */
export async function parseFeature(source: string, path: string): Promise<ParsedFeature> {
  let envelopes: readonly Envelope[];
  try {
    envelopes = generateMessages(source, path, SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
      includeGherkinDocument: true,
      includePickles: false,
      newId: IdGenerator.incrementing(),
    });
  } catch (err) {
    // Defensive: generateMessages re-throws only errors without a location
    // ("unexpected" ones). The core must never make the shell crash.
    return { ok: false, path, error: err instanceof Error ? err.message : String(err) };
  }

  // Single pass: collect parse errors and the (single) GherkinDocument.
  const parseErrorMessages: string[] = [];
  let gherkinDocument: GherkinDocument | undefined;
  for (const envelope of envelopes) {
    if (envelope.parseError !== undefined) {
      parseErrorMessages.push(envelope.parseError.message);
    }
    if (gherkinDocument === undefined && envelope.gherkinDocument !== undefined) {
      gherkinDocument = envelope.gherkinDocument;
    }
  }
  if (parseErrorMessages.length > 0) {
    return { ok: false, path, error: parseErrorMessages.join("\n") };
  }

  const feature = gherkinDocument?.feature;
  if (!feature) {
    // Parseable but without a `Feature:` line (e.g. empty source) — zero steps.
    return { ok: true, path, steps: [] };
  }

  const steps: StepRef[] = [];
  for (const child of feature.children) {
    collectChild(steps, child, path);
  }
  return { ok: true, path, language: feature.language, steps };
}

/** A Feature child or a Rule child — both hold backgrounds and scenarios. */
type ScenarioContainer = {
  readonly background?: Background;
  readonly scenario?: Scenario;
  readonly rule?: Rule;
};

function collectChild(steps: StepRef[], child: ScenarioContainer, path: string): void {
  if (child.background) {
    for (const step of child.background.steps) {
      steps.push(toStepRef(step, path));
    }
  }
  if (child.scenario) {
    steps.push(...scenarioSteps(child.scenario, path));
  }
  if (child.rule) {
    for (const ruleChild of child.rule.children) {
      collectChild(steps, ruleChild, path);
    }
  }
}

/**
 * Steps of one scenario. A plain scenario yields one StepRef per step; a
 * Scenario Outline (at least one Examples block) yields one StepRef per
 * (step × Examples row), the text interpolated and the line taken from the
 * Examples row — the placeholder step line produces no StepRef.
 */
function scenarioSteps(scenario: Scenario, path: string): StepRef[] {
  if (scenario.examples.length === 0) {
    return scenario.steps.map((step) => toStepRef(step, path));
  }
  const refs: StepRef[] = [];
  for (const examples of scenario.examples) {
    const header = examples.tableHeader?.cells.map((cell) => cell.value) ?? [];
    for (const row of examples.tableBody) {
      const cells = row.cells.map((cell) => cell.value);
      for (const step of scenario.steps) {
        refs.push({
          path,
          line: row.location.line,
          keyword: normalizedKeyword(step),
          text: interpolate(step.text, header, cells),
        });
      }
    }
  }
  return refs;
}

/** Replace `<name>` placeholders with the Examples row values (Behat semantics). */
function interpolate(text: string, header: readonly string[], row: readonly string[]): string {
  if (header.length === 0) {
    return text;
  }
  return text.replace(/<([^>]*)>/g, (match, name: string) => {
    const index = header.indexOf(name);
    return index >= 0 ? (row[index] ?? "") : match;
  });
}

/**
 * The AST carries the dialect keyword with its trailing space ("Soit ") —
 * the dialect table encodes it to enforce the word boundary; the StepRef
 * contract requires the normalized keyword ("Soit").
 */
function normalizedKeyword(step: Step): string {
  return step.keyword.trimEnd();
}

function toStepRef(step: Step, path: string): StepRef {
  return {
    path,
    line: step.location.line,
    keyword: normalizedKeyword(step),
    text: step.text,
  };
}

/**
 * Index build + derived views (SPEC.md §5 — `index.ts`).
 *
 * Pure: no `vscode` import, no I/O, no clock reads except the budget
 * asserted in the unit tests. The imperative shell reads and parses the
 * workspace, then hands the raw `StepRef[]` / `DefinitionRef[]` arrays in;
 * everything is derived here.
 *
 * Semantics (Behat-exact, see `matcher.ts`):
 * - matching is type-agnostic (no Given/When/Then filter);
 * - a step with several matching definitions is AMBIGUOUS (several entries
 *   in `stepToDefinitions`) — the runtime `AmbiguousMatchException` case;
 * - a definition whose expression is untranslatable is carried in
 *   `untranslatable` (fail loud) and never matches — it is therefore also
 *   an orphan (0 usages), which the `orphanedDefinitions` view reports.
 */
import type { CompiledDefinition, DefinitionRef, Index, StepRef } from "./types.js";
import { definitionKey, stepKey } from "./types.js";
import { compileExpression, matches } from "./matcher.js";

/**
 * Builds the full index:
 * - `stepToDefinitions` — forward resolution (AC-1): step key -> the
 *   definitions matching it (several = ambiguous, as at the Behat runtime);
 * - `definitionToSteps` — reverse resolution (AC-2): definition key -> all
 *   the steps it matches (usages);
 * - `untranslatable` — fail-loud registry (SPEC §5).
 *
 * Complexity is O(steps x definitions): the reference fixture (12 x 9)
 * builds in well under 1 ms — the 500 ms wall-time budget is asserted in
 * the unit tests (SPEC §5).
 */
export function buildIndex(
  steps: readonly StepRef[],
  definitions: readonly DefinitionRef[]
): Index {
  const compiled = new Map<string, CompiledDefinition>();
  const untranslatable: { readonly definition: DefinitionRef; readonly reason: string }[] = [];

  for (const def of definitions) {
    const c = compileExpression(def.expression);
    compiled.set(definitionKey(def), c);
    if (c.kind === "untranslatable") {
      untranslatable.push({ definition: def, reason: c.reason });
    }
  }

  // Mutable while built; returned as the frozen `Index` contract.
  const stepToDefs = new Map<string, DefinitionRef[]>();
  const defToSteps = new Map<string, StepRef[]>();
  for (const def of definitions) {
    defToSteps.set(definitionKey(def), []);
  }

  for (const step of steps) {
    const hit: DefinitionRef[] = [];
    for (const def of definitions) {
      if (matches(compiled.get(definitionKey(def))!, step.text)) {
        hit.push(def);
        defToSteps.get(definitionKey(def))!.push(step);
      }
    }
    stepToDefs.set(stepKey(step), hit);
  }

  return {
    steps,
    definitions,
    stepToDefinitions: stepToDefs,
    definitionToSteps: defToSteps,
    untranslatable,
  };
}

/**
 * Steps with no matching definition (AC-3 — error diagnostic).
 * Order: the order of the input steps.
 */
export function undefinedSteps(index: Index): readonly StepRef[] {
  const out: StepRef[] = [];
  for (const step of index.steps) {
    if (index.stepToDefinitions.get(stepKey(step))?.length === 0) {
      out.push(step);
    }
  }
  return out;
}

/**
 * Definitions with no matching step (AC-3 — info diagnostic, gated by the
 * `gherkinBehat.orphans` setting in the shell). Untranslatable definitions
 * are included: they never match, so they have no usage.
 * Order: the order of the input definitions.
 */
export function orphanedDefinitions(index: Index): readonly DefinitionRef[] {
  const out: DefinitionRef[] = [];
  for (const def of index.definitions) {
    if (index.definitionToSteps.get(definitionKey(def))?.length === 0) {
      out.push(def);
    }
  }
  return out;
}

/** A group of strictly-identical-pattern definitions (AC-3 — warning). */
export interface DuplicateGroup {
  /** The verbatim expression shared by the whole group. */
  readonly expression: string;
  /** The definitions declaring it (at least 2). */
  readonly definitions: readonly DefinitionRef[];
}

/**
 * Groups of strictly-identical-pattern definitions (AC-3 — warning
 * diagnostic, the `AmbiguousMatchException` semantics of the Behat
 * runtime): identity is the **verbatim expression**, and the annotation
 * type is irrelevant — matching is type-agnostic, so two definitions with
 * the same pattern make any matching step ambiguous. A near-identical
 * pattern (e.g. `[\w-]+` vs `[\w.-]+`) is NOT a duplicate.
 *
 * Untranslatable definitions are excluded: they never match, so they can
 * never make a step ambiguous.
 * Order: the order of first occurrence in the input definitions.
 */
export function duplicateDefinitions(index: Index): readonly DuplicateGroup[] {
  const untranslatableKeys = new Set(
    index.untranslatable.map((u) => definitionKey(u.definition))
  );
  const byExpression = new Map<string, DefinitionRef[]>();
  for (const def of index.definitions) {
    if (untranslatableKeys.has(definitionKey(def))) {
      continue;
    }
    const list = byExpression.get(def.expression);
    if (list === undefined) {
      byExpression.set(def.expression, [def]);
    } else {
      list.push(def);
    }
  }
  const out: DuplicateGroup[] = [];
  for (const [expression, defs] of byExpression) {
    if (defs.length > 1) {
      out.push({ expression, definitions: defs });
    }
  }
  return out;
}

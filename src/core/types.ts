/**
 * Shared contracts of the functional core (SPEC.md §5).
 *
 * The core is pure: no `vscode` import, no I/O, no clock, no randomness.
 * Everything that touches the outside world lives in `src/extension/`
 * (the imperative shell).
 */

/** Gherkin keyword types — display metadata only, never used for matching. */
export type StepType = "Given" | "When" | "Then";

/**
 * A step extracted from a `.feature` file by the Gherkin parser.
 * For Scenario Outline rows, `text` is the interpolated text (Examples applied) —
 * interpolation happens **before matching**, as in the Behat runtime.
 */
export interface StepRef {
  /** Feature file path, relative to the workspace root. */
  readonly path: string;
  /** 1-based line in the file. For Outline rows: the line of the Examples row. */
  readonly line: number;
  /** Keyword as written in the source (e.g. "Soit", "Given") — display only. */
  readonly keyword: string;
  /** Step text to match (interpolated for Outline rows). */
  readonly text: string;
}

/**
 * One PHP step definition — one per docblock annotation.
 * A method carrying N annotations yields N `DefinitionRef`s.
 */
export interface DefinitionRef {
  /** PHP file path, relative to the workspace root. */
  readonly path: string;
  /** 1-based line of the annotation in the file. */
  readonly line: number;
  /** Fully qualified class name (e.g. "App\\Behat\\CommandeSteps"). */
  readonly fqcn: string;
  /** Method name. */
  readonly method: string;
  /** Method parameter names in order (e.g. ["numero"]). */
  readonly parameters: string[];
  /** Annotation type (@Given / @When / @Then) — display metadata only, never used for matching. */
  readonly type: StepType;
  /** Expression exactly as declared (regex with delimiters, or a `:param` pattern). */
  readonly expression: string;
  /** `@Transform` class name when present — parsed and displayed, never evaluated. */
  readonly transform?: string;
}

/**
 * A step expression compiled for matching (SPEC.md §5).
 *
 * - `regex`: PCRE translated to a JS RegExp — matched **unanchored**
 *   (preg_match semantics), the expression's own modifiers become RegExp flags
 *   (always including `u`).
 * - `param`: a `:param` pattern — each `:name` replaced by Behat's official token,
 *   anchored `^…$`, flags `iu`.
 * - `untranslatable`: the expression could not be translated — the definition is
 *   **never matched** (fail loud, never a false match); the reason is displayed
 *   in hover and diagnostics.
 */
export type CompiledDefinition =
  | { readonly kind: "regex"; readonly pattern: RegExp; readonly raw: string }
  | { readonly kind: "param"; readonly pattern: RegExp; readonly raw: string; readonly params: string[] }
  | { readonly kind: "untranslatable"; readonly raw: string; readonly reason: string };

/** The index built from steps and definitions (SPEC.md §5, `index.ts`). */
export interface Index {
  readonly steps: readonly StepRef[];
  readonly definitions: readonly DefinitionRef[];
  /** Step key → the definitions matching it (several = ambiguous, as at the Behat runtime). */
  readonly stepToDefinitions: ReadonlyMap<string, readonly DefinitionRef[]>;
  /** Definition key → the steps it matches (usages, reverse navigation). */
  readonly definitionToSteps: ReadonlyMap<string, readonly StepRef[]>;
  /** Definitions whose expression could not be translated (fail loud). */
  readonly untranslatable: readonly { readonly definition: DefinitionRef; readonly reason: string }[];
}

/** Stable key of a step (path + line). */
export function stepKey(step: StepRef): string {
  return `${step.path}:${step.line}`;
}

/** Stable key of a definition (path + line). */
export function definitionKey(def: DefinitionRef): string {
  return `${def.path}:${def.line}`;
}

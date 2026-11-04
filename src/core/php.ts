/**
 * Behat PHP docblock scanner (SPEC.md §5 — `php.ts`).
 *
 * Pure, synchronous, zero I/O: the imperative shell (`src/extension/`) reads
 * the PHP file and hands the source over; `scanPhp` never touches disk,
 * clock or network. Line-based by design (no tree-sitter in v0 — a heavy
 * binary dependency for a line-tractable pattern).
 *
 * Documented limitations (SPEC §5, and §4 for PHP 8 attributes):
 * - one annotation per line, at the start of the line's content (after the
 *   docblock's `*` decoration);
 * - the docblock must be **directly above** the method: the line that
 *   closes the docblock is immediately followed (no blank line, no comment)
 *   by the signature — otherwise the docblock is not indexed;
 * - the signature on one line (a multi-line parameter list is not indexed);
 * - `class` only: a step method living in a trait or an interface is not
 *   indexed in v0 (a Behat feature class is a class);
 * - the namespace is the one-line `namespace App\X;` form (the braced
 *   `namespace App { }` form is not recognized);
 * - step annotations are case-sensitive, as in Behat: `@given` is not an
 *   annotation;
 * - `@And`/`@But` are not indexed: the frozen `StepType` contract
 *   (`types.ts`) only carries Given/When/Then;
 * - PHP 8 attributes (`#[When]`) are not indexed in v0 — an honest,
 *   documented limitation (SPEC §4).
 */
import type { DefinitionRef, StepType } from "./types.js";

/** One step annotation found on a docblock line. */
interface DocAnnotation {
  /** 1-based line of the annotation. */
  readonly line: number;
  readonly type: StepType;
  /** Expression verbatim as declared, trimmed — the scanner does NOT classify it. */
  readonly expression: string;
}

/** The step annotations of a docblock, plus its optional `@Transform`. */
interface DocBlock {
  readonly annotations: readonly DocAnnotation[];
  /** `@Transform` class name — parsed and displayed, never evaluated (SPEC §4). */
  readonly transform?: string;
}

/** A method signature: name + parameter names in order. */
interface FunctionSignature {
  readonly name: string;
  readonly parameters: readonly string[];
}

/**
 * Index every Behat step definition of a PHP file.
 *
 * @param source the file's full source (the shell does the I/O).
 * @param path the path recorded on each `DefinitionRef` (echoed as-is).
 * @returns one `DefinitionRef` per step annotation, in file order — a method
 *   carrying N annotations yields N `DefinitionRef`s.
 */
export function scanPhp(source: string, path: string): DefinitionRef[] {
  const lines = source.split(/\r?\n/);
  const definitions: DefinitionRef[] = [];
  let namespace = ""; // "" = global namespace
  let className = ""; // "" = outside a class (top-level functions are skipped)

  for (let i = 0; i < lines.length; i++) {
    const ns = NAMESPACE_DECL.exec(lines[i]);
    if (ns !== null) {
      namespace = ns[1];
      continue;
    }
    const cls = CLASS_DECL.exec(lines[i]);
    if (cls !== null) {
      className = cls[1];
      continue;
    }
    if (!DOC_BLOCK_START.test(lines[i])) continue;

    const end = findDocBlockEnd(lines, i);
    if (end === -1) continue; // unclosed `/**` → not a docblock

    // Documented limitation: the docblock sits directly above the method —
    // the closing line must be immediately followed by the signature.
    const signature = parseFunctionSignature(lines[end + 1] ?? "");
    if (signature === null || className === "") continue;

    const doc = parseAnnotations(lines, i, end);
    if (doc.annotations.length === 0) continue; // no step annotation → silence

    const fqcn = namespace === "" ? className : `${namespace}\\${className}`;
    for (const annotation of doc.annotations) {
      // `transform` is built-in at construction: `DefinitionRef` is frozen (readonly).
      const definition: DefinitionRef = {
        path,
        line: annotation.line,
        fqcn,
        method: signature.name,
        parameters: [...signature.parameters],
        type: annotation.type,
        expression: annotation.expression,
        ...(doc.transform !== undefined ? { transform: doc.transform } : {}),
      };
      definitions.push(definition);
    }
    i = end; // resume the scan after the docblock
  }
  return definitions;
}

/** Step keywords recognized by the scanner — case-sensitive, as in Behat. */
const STEP_KEYWORD_TO_TYPE: Readonly<Record<string, StepType>> = {
  Given: "Given",
  When: "When",
  Then: "Then",
};
const STEP_ANNOTATION = /^@(Given|When|Then)\s+(\S.*)$/;
const TRANSFORM_ANNOTATION = /^@Transform\s+([A-Za-z_][\w\\]*)/;
const DOC_BLOCK_START = /^\s*\/\*\*/;
const NAMESPACE_DECL = /^\s*namespace\s+([A-Za-z_][\w\\]*)\s*;/;
/** `class` only (documented limitation) — `final`/`abstract` modifiers tolerated. */
const CLASS_DECL = /^\s*(?:(?:final|abstract)\s+)?class\s+([A-Za-z_]\w*)/;
/** The signature on one line (documented limitation) — modifiers tolerated. */
const FUNCTION_SIG =
  /^\s*(?:(?:public|protected|private|static|final|abstract)\s+)*function\s+([A-Za-z_]\w*)\s*\(/;
/** One parameter: type, `...`, by-reference `&` and default value are dropped. */
const PARAMETER_NAME = /^\s*(?:(?:[\w\\?|]+\s+)*(?:\.\.\.\s*)?(?:&\s*)?)\$([A-Za-z_]\w*)/;

/** Index of the line closing the docblock opened at `start` — -1 when unclosed. */
function findDocBlockEnd(lines: readonly string[], start: number): number {
  if (lines[start].includes("*/")) return start;
  for (let j = start + 1; j < lines.length; j++) {
    if (lines[j].includes("*/")) return j;
  }
  return -1;
}

/** A method signature line → name + parameter names — null when not a signature. */
function parseFunctionSignature(line: string): FunctionSignature | null {
  const m = FUNCTION_SIG.exec(line);
  if (m === null) return null;
  // The match is anchored and ends at the parameters' opening paren, which is
  // the first `(` of the line (modifiers, `function` and the name carry none).
  const open = line.indexOf("(");
  if (open === -1) return null;
  const close = matchingClose(line, open);
  if (close === -1) return null; // multi-line signature — documented limitation
  return { name: m[1], parameters: parseParameters(line.slice(open + 1, close)) };
}

/** Index of the bracket matching the one opened at `open` — -1 when not on this line. */
function matchingClose(line: string, open: number): number {
  let depth = 0;
  for (let j = open; j < line.length; j++) {
    const ch = line.charAt(j);
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/** Parameter names in order (top-level commas only — `[]`/`()` defaults are nested). */
function parseParameters(list: string): string[] {
  if (list.trim() === "") return [];
  const names: string[] = [];
  let depth = 0;
  let start = 0;
  for (let j = 0; j < list.length; j++) {
    const ch = list.charAt(j);
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      pushParameterName(names, list.slice(start, j));
      start = j + 1;
    }
  }
  pushParameterName(names, list.slice(start));
  return names;
}

function pushParameterName(names: string[], part: string): void {
  const m = PARAMETER_NAME.exec(part);
  if (m !== null) names.push(m[1]);
}

/**
 * Content of a docblock line: the opening/closing delimiters removed, the
 * `*` decoration removed (one annotation per line, at the start of the content).
 */
function docblockContent(line: string): string {
  let s = line;
  const open = /^\s*\/\*\*(.*)$/.exec(s);
  if (open !== null) s = open[1];
  // A one-line docblock closes on the same line: the closing delimiter must be
  // removed here too — kept, it would leak into the expression verbatim.
  const closeIdx = s.indexOf("*/");
  if (closeIdx !== -1) s = s.slice(0, closeIdx) + s.slice(closeIdx + 2);
  return s.replace(/^\s*\*+\s?/, "").trim();
}

/** The step annotations of the docblock `[start..end]` + its optional `@Transform`. */
function parseAnnotations(lines: readonly string[], start: number, end: number): DocBlock {
  const annotations: DocAnnotation[] = [];
  let transform: string | undefined;
  for (let j = start; j <= end; j++) {
    const content = docblockContent(lines[j]);
    if (content === "") continue;

    const step = STEP_ANNOTATION.exec(content);
    if (step !== null) {
      const type = STEP_KEYWORD_TO_TYPE[step[1]];
      if (type !== undefined) {
        annotations.push({ line: j + 1, type, expression: step[2].trim() });
      }
      continue;
    }

    const t = TRANSFORM_ANNOTATION.exec(content);
    if (t !== null && transform === undefined) {
      transform = t[1];
    }
  }
  return transform === undefined ? { annotations } : { annotations, transform };
}

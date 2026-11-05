/**
 * HoverProvider — both directions (AC-4).
 *
 * - On a feature step: the step keyword (display metadata — no effect on
 *   the type-agnostic resolution), the matching definition(s) — annotation,
 *   FQCN, method, expression, named groups ↔ method parameters, `@Transform`
 *   when present; several matches = ambiguity flagged (the runtime
 *   AmbiguousMatchException case). No match: the undefined-step notice.
 * - On a PHP definition docblock (the `@Given`/`@When`/`@Then` annotation
 *   line, or any other line of the docblock — `@Transform`, opening,
 *   closing): the definition card + its usages (all matching steps).
 *   Untranslatable: the fail-loud reason, never a false match.
 */
import * as vscode from "vscode";
import { definitionKey, stepKey } from "../core/types.js";
import type { DefinitionRef, Index } from "../core/types.js";
import { relativeToRoot } from "./workspace.js";

const SELECTOR: vscode.DocumentSelector = [
  { scheme: "file", language: "gherkin" },
  { scheme: "file", language: "php" },
  { scheme: "file", pattern: "**/*.{feature,php}" },
];

interface IndexSource {
  readonly current: Index | null;
}

/** Named-group names in the order they appear in the raw expression. */
function namedGroups(expression: string): string[] {
  const names: string[] = [];
  for (const m of expression.matchAll(/\(\?P<([A-Za-z_][A-Za-z0-9_]*)>/g)) {
    names.push(m[1]);
  }
  return names;
}

/** A docblock step-definition annotation line (@Given/@When/@Then). */
const STEP_ANNOTATION_RE = /^\s*\*?\s*@(Given|When|Then)\b/;

/** The definition card shared by both directions. */
function appendDefinitionCard(md: vscode.MarkdownString, def: DefinitionRef): void {
  md.appendCodeblock(
    [
      `@${def.type} ${def.expression}`,
      def.transform ? `@Transform ${def.transform}` : null,
      // Untyped parameters: the scanner drops types by design (v0) — the
      // card must not fabricate a `string` type.
      `${def.fqcn}::${def.method}(${def.parameters.map((p) => `$${p}`).join(", ")})`,
    ]
      .filter((l): l is string => l !== null)
      .join("\n"),
    "php"
  );
  const groups = namedGroups(def.expression);
  if (groups.length > 0) {
    const pairs = groups
      .map((g, i) =>
        def.parameters[i] !== undefined
          ? `${g} ↔ $${def.parameters[i]}`
          : `${g} (no parameter #${i + 1})`
      )
      .join(", ");
    md.appendText(`\nnamed groups ↔ parameters: ${pairs}`);
  }
}

/**
 * The docblock lines enclosing `line0` (the `/**` opening line through the
 * closing comment line), or undefined when the cursor is not inside one.
 */
function docBlockLines(
  document: vscode.TextDocument,
  line0: number
): { readonly start: number; readonly lines: string[] } | undefined {
  const lines = document.getText().split(/\r?\n/);
  const cursor = lines[line0] ?? "";
  const cursorTrimmed = cursor.trim();
  if (
    !cursor.trimEnd().endsWith("/**") &&
    cursorTrimmed.length > 0 &&
    !cursorTrimmed.startsWith("*")
  ) {
    // The cursor line is code (or a non-docblock line) — not inside one.
    return undefined;
  }
  let start = -1;
  for (let i = line0; i >= 0; i -= 1) {
    if (lines[i].trimEnd().endsWith("/**")) {
      start = i;
      break;
    }
    if (i < line0) {
      const t = lines[i].trim();
      // Above the cursor, a docblock line is empty or `*`-prefixed;
      // anything else means the cursor is not inside the block.
      if (t.length > 0 && !t.startsWith("*")) {
        return undefined;
      }
    }
  }
  if (start === -1) {
    return undefined;
  }
  let end = -1;
  for (let i = start; i < lines.length; i += 1) {
    if (lines[i].trimEnd().endsWith("*/")) {
      end = i;
      break;
    }
  }
  if (end === -1 || end < line0) {
    return undefined;
  }
  // `start` is 0-based; the caller converts block-relative offsets to the
  // 1-based lines carried by the core refs.
  return { start, lines: lines.slice(start, end + 1) };
}

export function registerHoverProvider(
  context: vscode.ExtensionContext,
  source: IndexSource
): void {
  const provider: vscode.HoverProvider = {
    provideHover(document, position) {
      const index = source.current;
      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!index || !root) {
        return undefined;
      }
      const relPath = relativeToRoot(root.fsPath, document.uri.fsPath);
      if (relPath === undefined) {
        return undefined;
      }
      const line = position.line + 1; // 1-based, as carried by the core refs

      const step = index.steps.find((s) => s.path === relPath && s.line === line);
      if (step) {
        const md = new vscode.MarkdownString();
        // Step keyword as display metadata (hover.feature — no effect on
        // the type-agnostic resolution).
        md.appendText(`*step keyword:* ${step.keyword}\n`);
        const defs = index.stepToDefinitions.get(stepKey(step)) ?? [];
        if (defs.length === 0) {
          md.appendText("*Undefined step* — no matching step definition.");
          return new vscode.Hover(md);
        }
        for (const def of defs) {
          appendDefinitionCard(md, def);
        }
        if (defs.length > 1) {
          md.appendText(
            `\n*Ambiguous: ${defs.length} definitions match this step (Behat AmbiguousMatchException).*`
          );
        }
        return new vscode.Hover(md);
      }

      let def = index.definitions.find(
        (d) => d.path === relPath && d.line === line
      );
      if (def === undefined) {
        // Cursor elsewhere in the annotation docblock (@Transform, /** or
        // */): resolve the block's first step annotation.
        const block = docBlockLines(document, position.line);
        if (block !== undefined) {
          for (let i = 0; i < block.lines.length; i += 1) {
            if (!STEP_ANNOTATION_RE.test(block.lines[i])) {
              continue;
            }
            def = index.definitions.find(
              (d) => d.path === relPath && d.line === block.start + i + 1
            );
            if (def !== undefined) {
              break;
            }
          }
        }
      }
      if (def) {
        const md = new vscode.MarkdownString();
        const untranslatable = index.untranslatable.find(
          (u) => definitionKey(u.definition) === definitionKey(def)
        );
        if (untranslatable) {
          md.appendText("*Untranslatable expression — never matched (fail loud).*\n\n");
          md.appendCodeblock(untranslatable.reason, "plaintext");
          return new vscode.Hover(md);
        }
        appendDefinitionCard(md, def);
        const steps = index.definitionToSteps.get(definitionKey(def)) ?? [];
        if (steps.length === 0) {
          md.appendText("\n*Orphan definition* — no matching step.");
        } else {
          md.appendText(`\nUsages (${steps.length}):\n`);
          for (const s of steps) {
            md.appendText(`- \`${s.path}:${s.line}\` ${s.keyword} ${s.text}\n`);
          }
        }
        return new vscode.Hover(md);
      }

      return undefined;
    },
  };
  context.subscriptions.push(vscode.languages.registerHoverProvider(SELECTOR, provider));
}

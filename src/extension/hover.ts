/**
 * HoverProvider — both directions (AC-4).
 *
 * - On a feature step: the matching definition(s) — annotation, FQCN,
 *   method, expression, named groups ↔ method parameters, `@Transform`
 *   when present; several matches = ambiguity flagged (the runtime
 *   AmbiguousMatchException case). No match: the undefined-step notice.
 * - On a PHP definition annotation: the definition card + its usages
 *   (all matching steps). Untranslatable: the fail-loud reason, never a
 *   false match.
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

/** The definition card shared by both directions. */
function appendDefinitionCard(md: vscode.MarkdownString, def: DefinitionRef): void {
  md.appendCodeblock(
    [
      `@${def.type} ${def.expression}`,
      def.transform ? `@Transform ${def.transform}` : null,
      `${def.fqcn}::${def.method}(${def.parameters
        .map((p) => `string $${p}`)
        .join(", ")})`,
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

      const def = index.definitions.find(
        (d) => d.path === relPath && d.line === line
      );
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


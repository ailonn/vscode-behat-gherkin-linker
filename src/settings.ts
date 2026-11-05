/**
 * Settings reading + normalization (SPEC.md §5 — `src/settings.ts`).
 *
 * `gherkinBehat.features` / `.steps` accept a string or an array of globs
 * (package.json); both are normalized to arrays. `vendor/` and
 * `node_modules/` are always excluded at query time (SPEC §5 v0 decision).
 */
import * as vscode from "vscode";

export interface GherkinBehatSettings {
  readonly features: readonly string[];
  readonly steps: readonly string[];
  readonly orphans: boolean;
}

function toArray(value: string | string[] | undefined, fallback: string): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }
  return [fallback];
}

export function readSettings(): GherkinBehatSettings {
  const config = vscode.workspace.getConfiguration("gherkinBehat");
  return {
    features: toArray(
      config.get<string | string[]>("features", "**/*.feature"),
      "**/*.feature"
    ),
    steps: toArray(
      config.get<string | string[]>("steps", "**/*.php"),
      "**/*.php"
    ),
    orphans: config.get<boolean>("orphans", true),
  };
}

/** Always excluded, whatever the configured globs (AC-5, package.json). */
export const ALWAYS_EXCLUDED = "**/{node_modules,vendor}/**";

# Gherkin ↔ Behat Linker

Bidirectional navigation between Gherkin `.feature` steps and Behat PHP step definitions — static analysis, zero PHP, exact Behat matching semantics.

## Problem

In Behat, the link between a `.feature` step and its PHP definition is **conventional**: the step text is matched at runtime against the regex declared in a docblock annotation (`@Given`, `@When`, `@Then`). The editor knows nothing about this link:

- from a step, no navigation to the implementing PHP method;
- from a definition, no view of the features and steps that use it;
- undefined steps and orphan definitions are only visible by running Behat — which requires a PHP toolchain and `composer install`.

This extension makes the link **navigable in both directions** and highlights the problems, fully **statically**: no PHP, no `vendor/`, no CLI.

## Features

- **Feature → definition** (F12 / `Cmd/Ctrl+Click`): a step resolves to its PHP definition — regex expressions with named groups, or `:param` expressions — with **type-agnostic matching**, exactly as the Behat runtime matches.
- **Definition → usages** (`Shift+F12` / *Find All References*): a PHP step definition resolves to every matching feature step, across all feature files. A method carrying N annotations yields N definitions.
- **Hover, both directions**: step → class (FQCN) / method / expression / named groups ↔ method parameters (plus `@Transform` resolution); definition → its usages; an untranslatable expression → the reason (fail loud).
- **Five diagnostics** — see [Diagnostics](#diagnostics).
- **All official Gherkin dialects** — French, English, German, and the rest via `# language:` (keywords come from the official [`@cucumber/gherkin`](https://www.npmjs.com/package/@cucumber/gherkin) parser — nothing hardcoded). A feature **without** a `# language:` header is parsed in English (the parser's official default).
- **Static, zero CLI** — indexing and navigation work in a workspace with no PHP and no `vendor/`.

## Diagnostics

| Diagnostic | Severity | Position | Condition |
|---|---|---|---|
| Step undefined | error | feature, line of the step | the step matches no definition |
| Orphan definition | info | PHP, line of the annotation | the definition matches no step (controlled by `gherkinBehat.orphans`) |
| Duplicate definition | warning | PHP, lines of the group | strictly identical pattern, N ≥ 2 definitions |
| Untranslatable expression | info | PHP, line of the annotation | the PCRE expression cannot be translated to JavaScript — the reason is in the message (fail loud: the step is never falsely matched) |
| Unparseable Gherkin | error | feature (line when the parser provides one) | the parser could not parse the file |

The matching semantics are verified against the Behat 3.x source (`RepositorySearchEngine::match()`) as of 2026-11-04.

## Positioning

- The **Cucumber official** extension is one-way (feature → definition only) and offers no orphan/duplicate detection, no reverse navigation, and no hover with parameter mapping.
- **Behat Checker** drives the **Behat CLI** (`behat -di`) to highlight undefined steps — it requires a working PHP toolchain.

This extension fills the gap: reverse navigation, orphan and duplicate detection, bidirectional hover with parameter mapping, and zero PHP.

## Install

v0.1.0 is distributed as a VSIX on GitHub Releases (no marketplace publication in v0):

1. Download `gherkin-behat-linker-0.1.0.vsix` from the [releases](https://github.com/ailonn/vscode-behat-gherkin-linker/releases).
2. VS Code → *Extensions* (`Ctrl/Cmd+Shift+X`) → `···` menu → *Install from VSIX…* → select the file.
3. Open a workspace with `.feature` files and PHP step definitions: the index builds on startup and on every file change (debounced, full rebuild).

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `gherkinBehat.enabled` | boolean | `true` | Index the workspace (navigation + diagnostics). `false`: no file is read, no diagnostic is emitted. |
| `gherkinBehat.features` | string or array | `**/*.feature` | Glob(s) of Gherkin feature files to index. |
| `gherkinBehat.steps` | string or array | `**/*.php` | Glob(s) of PHP step definition files to index. |
| `gherkinBehat.orphans` | boolean | `true` | Emit info diagnostics for orphan step definitions (no matching step). |

`vendor/` and `node_modules/` are always excluded, whatever the globs.

## What the extension does not resolve, and why

- **Docblock annotations only.** PHP 8 attributes (`#[When]`) are supported by Behat (since 3.9.0, where docblock annotations are deprecated) but are **not indexed in v0** — the scanner is a line-based docblock scan by design (no PHP parser in v0).
- **Duplicate detection is an approximation.** The warning fires on **strictly identical patterns** (regardless of annotation type — matching is type-agnostic, so such a group is genuinely ambiguous at the Behat runtime: `AmbiguousMatchException`). Two patterns that are semantically equivalent but textually different are **not** flagged.
- **Accent divergence with the `i` flag.** JavaScript case folding folds accents (`JÉRÔME` ~ `jérôme`); PCRE without Unicode properties folds ASCII only. Declared divergence (SPEC §5).
- **Single workspace root.** Only the first root of a multi-root workspace is indexed.
- **No Cucumber Expressions.** Behat does not support them (no code in Behat 3.x/4.x — open request [Behat/Behat#1254](https://github.com/Behat/Behat/issues/1254)).
- **Untranslatable PCRE constructs** (`\K`, `\A`, `\z`, possessive quantifiers, …) are never silently mis-matched: the definition is indexed with an info diagnostic carrying the reason (fail loud).

## Specified in Gherkin

The acceptance criteria are specified in Gherkin ([`features/`](features/), official dialects — one scenario per AC): the executable form of [`SPEC.md`](SPEC.md) §3.

## Development

```sh
corepack enable
nvm use            # 22.14.0 (.nvmrc)
pnpm install
pnpm test          # unit suite (functional core)
pnpm test:integration   # e2e in a real VS Code instance (downloads VS Code on first run)
pnpm test:stress        # stress e2e 1000x1000 in a real VS Code instance (minutes, wall-time budget-gated)
```

The toolchain is pinned: `packageManager` (pnpm 10.33.2 — fail loud on mismatch, see `.npmrc`) + `engines.node` (`>=20 <23`, the floor is the Node runtime of VS Code 1.90) + `.nvmrc` (22.14.0, the tested version).

## License

[MIT](LICENSE)

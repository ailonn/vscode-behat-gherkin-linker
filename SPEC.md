# SPEC — vscode-behat-gherkin-linker

> **Acceptance specification — target v0.1.0** · amended 2026-11-04 after committee review
> (Qualité Analyst + scoped technical expert — 3 convergent BLOQUANT findings corrected,
> NON BLOQUANTs E4–E13 integrated) with PO decisions: **type-agnostic matching** (faithful
> to the Behat runtime) · **no Cucumber Expressions in v0** (Behat does not support them) ·
> **all official Gherkin dialects** (sampled tests). **Validated** — PO final
> validation of this spec + the `features/` lot passed (2026-11-04); changes now
> go through the phase challenge gate.
> The Gherkin features in `features/` (French, official dialect) are the executable form
> of the acceptance criteria in §3: one scenario per AC. Code and tests must satisfy
> both.

## 1. Problem

In Behat, the link between a `.feature` step and its PHP definition is
**conventional**: the step text is matched at runtime against the regex declared in a
docblock annotation (`@Given`, `@When`, `@Then`). The editor knows nothing about this
link:

- from a step, no navigation to the implementing PHP method;
- from a definition, no view of the features/steps that use it;
- undefined steps and orphan definitions are only visible by running Behat — which
  requires a PHP toolchain + `composer install`.

**Goal** — a lightweight, fully **static** VS Code extension that makes the link
navigable in both directions, highlights undefined steps / orphan / duplicate
definitions, and works with **no PHP environment at all**.

**First consumer** — a legacy PHP project using Behat with French Gherkin
(`Soit` / `Quand` / `Alors` / `Et`), regex annotations with named groups
(`/(?P<path>[^"]+)/`), and steps containing double quotes.

## 2. State of the art (verified 2026-11-04)

| Existing | What it does for PHP/Behat | Limitations |
|---|---|---|
| **Cucumber official** — [`CucumberOpen/cucumber-official`](https://marketplace.visualstudio.com/items?itemName=CucumberOpen.cucumber-official), LSP [`cucumber/language-service`](https://github.com/cucumber/language-service) (MIT) | Parses Behat docblocks (`@Given`/`@When`/`@Then`, regex — [source](https://github.com/cucumber/language-service/blob/main/src/language/phpLanguage.ts)); go-to-definition feature→PHP; autocomplete; undefined-step diagnostics; Gherkin localisation (FR) | **One-way** (feature→definition only). PHP support is **regex-only** — `defineParameterTypeQueries: []` with the comment "Behat does not support Cucumber Expressions" (confirmed current: no Cucumber Expressions code in Behat 3.x/4.x — open request [Behat/Behat#1254](https://github.com/Behat/Behat/issues/1254)). No reverse navigation, no orphan/duplicate detection, no hover with parameter mapping. |
| **Behat Checker** — [`beeblebrox3.behat-checker`](https://marketplace.visualstudio.com/items?itemName=beeblebrox3.behat-checker) | Undefined-step highlighting + go-to-definition **via the Behat CLI** (`behat -di`) | Requires PHP + `vendor/bin/behat` installed; one-way; no orphan/hover; dormant. |

**Incremental value (the defensible niche)**

1. **Reverse navigation** — definition → all features/steps matching it.
2. **Orphan & duplicate detection** (+ undefined steps, re-derived statically).
3. **Hover** — both directions: expression, named groups ↔ method parameters, usages.
4. **Behat-exact expression surface** — regex (unanchored `preg_match`, as the Behat
   runtime) + `:param` (anchored, official token), with **type-agnostic matching**,
   exactly as the Behat runtime matches.
5. **Static, zero CLI** — no `composer install` needed.
6. **All official Gherkin dialects** — via `@cucumber/gherkin` (zero hardcoded keywords),
   `# language:` header included.

## 3. Scope v0.1.0 — acceptance criteria

One Gherkin scenario per AC in `features/`.

| # | AC | Gherkin |
|---|----|---------|
| AC-1 | Feature→definition: a step in a `.feature` resolves to its PHP definition (regex, `:param`) — **type-agnostic matching** (Behat-verified semantics: the keyword type is not part of the match) | `features/navigation.feature` |
| AC-2 | Definition→usages: a PHP step definition resolves to **all** matching features/steps (reverse) — a method carrying N annotations yields N definitions | `features/navigation.feature` |
| AC-3 | Diagnostics: undefined step (error) · orphan definition (info) · duplicate definition (warning — **strictly identical pattern, regardless of annotation type**, as the Behat runtime (`AmbiguousMatchException`, historically `RedundantStepException` in 3.x): matching is type-agnostic, so two definitions with the same pattern make a step ambiguous) | `features/diagnostics.feature` |
| AC-4 | Hover: step → class (FQCN) / method / expression / named groups ↔ method parameters · definition → usages | `features/hover.feature` |
| AC-5 | Static: indexing and navigation work in a workspace with **no PHP, no `vendor/`** | `features/static.feature` |
| AC-6 | Gherkin **all official dialects** — FR, EN and the rest via `# language:`; keywords consumed from the parser's `dialects` export (nothing hardcoded); a feature **without** a `# language:` header is parsed in English (the parser's official default — documented in the README); double quotes in step text; tested by sample (FR + EN + ≥ 1 third dialect) | `features/gherkin-dialects.feature` |
| AC-7 | Tests green in CI: the unit + integration suite covers each AC (fixtures: a generic FR PHP/Behat project, no personal data) | meta — §7 |
| AC-8 | Packaging: `vsce` packable; settings `gherkinBehat.enabled` (boolean, default `true` — off switch: no file is read, no diagnostic is emitted) / `gherkinBehat.features` (glob, string or array, default `**/*.feature`) / `gherkinBehat.steps` (glob, string or array, default `**/*.php`) / `gherkinBehat.orphans` (boolean, default `true`) | `features/packaging.feature` |

## 4. Non-goals (v0)

- No LSP (in-process extension; an LSP later only if multi-editor demand appears)
- No code generation, refactoring, or code editing
- No syntax highlighting / formatting / snippets (the ecosystem covers it)
- No other frameworks (cucumber-js, behave, godog…) — the adapter architecture keeps the door open
- No **Cucumber Expressions** — Behat does not support them (no code in 3.x/4.x, open
  request [Behat/Behat#1254](https://github.com/Behat/Behat/issues/1254)); out of v0
  scope, to revisit if Behat adopts them
- No Behat execution, no PHP compilation; docblock scanning only — PHP 8 attributes
  (`#[When]`) are supported by Behat since 3.9.0 (docblock annotations are deprecated
  there); v0 is docblock-only: an honest, documented limitation (README + this spec)
- No marketplace publication — GitHub Releases (vsix) only, in v0
- No custom parameter type resolution (`@Transform` is parsed + displayed, not evaluated)

## 5. Architecture — functional core / imperative shell

```
src/
  core/            # functional core — pure TypeScript, zero `vscode` import
    gherkin.ts     # thin wrapper over @cucumber/gherkin: dialects export, # language:,
                   #   Scenario Outline interpolation → StepRef[]
    php.ts         # Behat docblock scanner (line-based) → DefinitionRef[] (FQCN + parameter names)
    pcre.ts        # PCRE→JS translator (table below) — pure, Result-typed
    matcher.ts     # Behat semantics: type-agnostic, unanchored regex, anchored :param, named groups
    index.ts       # pure build: (StepRef[], DefinitionRef[]) → Index; rebuild
  extension/       # imperative shell — the only code importing `vscode`
    activation.ts  # watchers (debounce, coalesced, last-wins token), index (re)build
                   #   (per-file read failures → diagnostic + partial index, CRASH-003),
                   #   diagnostics publication
    definition.ts  # DefinitionProvider (feature → php)
    references.ts  # ReferenceProvider (php → features)
    hover.ts       # HoverProvider (both directions)
    diagnostics.ts # undefined (error) / orphan (info) / duplicate (warning) /
                   # untranslatable (info) / unparseable (error) / unreadable (error)
  settings.ts      # gherkinBehat.enabled / .features / .steps / .orphans
test/
  unit/            # vitest — core only, fixtures in test/fixtures/
  integration/     # @vscode/test-electron — providers + diagnostics + reloadWindow
features/          # acceptance spec — Gherkin FR (official dialect)
qa/
  crash-cases/     # resilience registry (parametrable, growing)
  automation.md    # CI automation plan (QA pipeline, step 5)
```

**Decisions**

- **`@cucumber/gherkin`** (MIT, official parser) for the Gherkin side — **version-pinned**
  (ESM-only since v40; the API is `generateMessages`, there is no `Gherkin.parse()`;
  transitive dependency `@cucumber/messages`). Every official dialect (FR included) and
  the `# language:` header come for free; **keywords are consumed from the package's
  `dialects` export — zero hardcoded keywords**; the AST carries keywords, text, and
  ranges. **Scenario Outline**: Examples rows are interpolated into the step text
  **before matching** (Behat semantics) — behaviour defined and tested in lot 1.
- **Line-based PHP docblock scanner** (no tree-sitter in v0 — a heavy binary dependency
  for a line-tractable pattern). Documented limits: annotations on one line, docblock
  directly above the method; a method with **multiple annotations yields multiple
  definitions** (N `DefinitionRef`s, each carrying the FQCN + parameter names for hover);
  PHP 8 attributes (`#[When]`) are **not indexed in v0** — documented limitation (§4).
- **PCRE→JS translator — the core risk** (Behat regexes are PCRE; Node `RegExp` is not).
  Every JS `RegExp` is built **with the `u` flag**: without it, unsupported PCRE
  constructs are silently accepted with a different meaning (`\K` → literal `K`,
  `\A` → literal `A`, `\z` → literal `z`) = silent false matches.

  | PCRE (PHP) | JS target | v0 |
  |---|---|---|
  | delimiter + modifier line `/…/imsx…` | delimiters stripped, `i`/`m`/`s` mapped to `RegExp` flags | ✓ |
  | `(?P<name>…)` named group | `(?<name>…)` | ✓ |
  | `(?P=name)` named backreference | `\k<name>` | ✓ |
  | lookbehind `(?<=…)` / `(?<!…)` | passthrough (ES2018+) | ✓ |
  | backreferences `\1` | passthrough | ✓ |
  | inline flags `(?i)` `(?m)` `(?s)` | hoisted to `RegExp` flags (`i`/`m`/`s`) | ✓ (single occurrence, start of expression) |
  | `\p{…}` Unicode properties | passthrough (ES2018+); unknown property = build error → fail loud | ✓ |
  | `U` / `A` / `D` / `J` modifiers (PCRE-only) | — | ✗ fail loud |
   | `u` / `S` modifiers (PCRE UTF8 flags) | no-op — a JS RegExp is always Unicode (mandatory `u` flag) | ✓ |
   | `X` modifier (PCRE_EXTRA) · turnip advanced syntax (`\(` optional word, `word/word`, `\/`) | — | ✗ fail loud (never a false match) |
  | scoped flags `(?i:…)` mid-pattern | — | ✗ fail loud |
  | `\K` / `\A` / `\z` | — (JS accepts them as literal characters = silent false match) | ✗ fail loud |
  | `x` flag (ignore whitespace) | — | ✗ reported |
  | possessive quantifiers `a++` / `a*+` | — | ✗ reported |
  | atomic groups `(?>…)` | — | ✗ reported |
  | `\x{…}` (Unicode codepoint escape) | — (JS uses `\u{…}`) | ✗ fail loud (reported v0.1.1) |
  | `i` flag (case folding) | JS folds accents (JÉRÔME ~ jérôme); PCRE without UCP = ASCII only | ✓ (declared divergence) |

  **Fail loud**: an expression that cannot be translated is indexed with an
  `untranslatable: <reason>` flag — the step is **not** matched (never a false match),
  the reason is shown in hover, and an info diagnostic is emitted.
- **Behat-exact matching semantics** (verified 2026-11-04 against the official docs and
  `RepositorySearchEngine::match()`):
  - **Type-agnostic** — Behat does **not** filter by keyword type at match time: a
    `Soit` step can match a `@Then` definition, and vice versa. The type is display
    metadata only (hover, colouring).
  - **regex expressions** → `preg_match` semantics: **unanchored** (a match anywhere in
    the step text suffices).
  - **`:param` expressions** → **anchored `^…$`** with flags `iu`; each `:param` is
    replaced by Behat's official token
    `["']?(?P<name>(?<=\")[^"]*(?=\")|(?<=')[^']*(?=')|-?[\w\.\,]+)['"]?`
    (quoted string, bare word, or number — comma-tolerant).
  - **`@Transform`** (the Behat annotation — `@paramType` belongs to Cucumber-JVM) is
    parsed and displayed, not evaluated (§4).
- **Full index rebuild on change** in v0 (no incremental) — simplicity first; the shell
  **debounces and coalesces** rebuilds (last-wins token: a stale build never overwrites
  a fresher one); the glob for features/steps **excludes `vendor/` and `node_modules/`**
  (index queries and watcher events). **v0 limitation: only the first workspace root is
  indexed** — multi-root workspaces are not supported yet. Budgets: reference fixture of fixed size
  (N steps / M definitions / K features) → **wall-time < 500 ms, asserted in unit
  tests**; stress 1 000 × 1 000 (chat-noir case) → no crash + its own wall-time budget,
  set on the first measured run and locked in CI.

## 6. QA pipeline (5 steps — skill `quality-checker`)

| Step | Verifies | Vehicle | Executor |
|---|---|---|---|
| 1 | New business rules of the delivered lot | Gherkin scenarios (AC) → tests | CI |
| 2 | Past rules (functional non-regression) | Existing test suite | CI |
| 3 | Resilience — crash (explicit reproducible trace) + restart → continues to work | `qa/crash-cases/` registry (parametrable) | `chat-noir` agent (fresh context) |
| 4 | Spec ↔ features ↔ code ↔ docs ↔ behavior coherence | `coherence-check` | Orchestrator |
| 5 | CI automation to shrink the manual steps | `qa/automation.md` | Orchestrator + PO |

Scorecard: one page per cycle (see the skill). **KPI**: decreasing manual time per cycle.

## 7. Test strategy

- **Unit (fast, no VS Code)** — vitest on the core: gherkin parsing (FR + EN + a third
  dialect via `# language:`, double quotes, **Scenario Outline interpolation**),
  PHP scanner (including multi-annotation methods), PCRE→JS translator (every row of
  the table, including the fail-loud cases), matcher (type-agnostic, unanchored regex,
  anchored `:param` with the official token), index build/rebuild (wall-time budget).
  **Architecture guard**: a test asserts **zero `vscode` import in `src/core/`**.
  Fixtures: `test/fixtures/` — a generic PHP/Behat FR project (no personal data),
  reference size N/M/K for the wall-time assertion.
- **Integration** — `@vscode/test-electron`: definition/references/hover providers,
  diagnostics (including **unparseable Gherkin → diagnostic, no crash**, and
  **unreadable file → read-failure diagnostic + partial index, no crash** —
  CRASH-003), and **`reloadWindow` resilience** (index rebuild after restart —
  the chat-noir case promoted to CI).
- **CI** — GitHub Actions (push/PR): Node 22, `npm ci`, unit, integration, `vsce pack`.

## 8. Release

- **v0.1.0** · SemVer from v0.1.0 · CHANGELOG from v2 · **MIT**
- Distribution: **GitHub only** (vsix in Releases) — marketplaces are a later decision
- README (EN): problem, state-of-the-art positioning (§2), install (vsix), configuration,
  limitations (docblock-only — PHP 8 attributes `#[When]` are not indexed, §4),
  a "specified in Gherkin" section pointing at `features/`
- v0 = single maintainer, no community contributions (the flow is defined at the first PR)

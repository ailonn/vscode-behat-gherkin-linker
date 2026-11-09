# Spec — stress generator (1000 × 1000)

> Acceptance spec for the stress fixture generator + stress e2e scenario — target v0.1.0.
> Process: tdd-outils (PO-validated before any code). Product context: `SPEC.md` §5
> (“stress 1 000 × 1 000 → no crash + its own wall-time budget, set on the first measured
> run and locked in CI”) + §7 (test strategy).
>
> **Validated** — PO final validation of this spec (Gherkin acceptance criteria + the
> `CA-n: <scenario title>` test-name mapping rule) passed on 2026-11-09; changes now go
> through the phase challenge gate.

## 1. Use case

- **Who**: the maintainer (locally, before a release) and the CI (push/PR = smoke, tag = full).
- **What**: generate a deterministic large workspace (N scenarios × M steps + 100 PHP definitions),
  run the extension in a real VS Code instance against it, assert no crash + functional
  navigation + wall-time budget.
- **When**: before every release (full 1000 × 1000, before `vsce pack`), on every push/PR (smoke 100 × 100).

## 2. Acceptance criteria

> Each CA is a Gherkin scenario. Its **scenario title is the canonical anchor of the test
> name**: the test carrying a CA is named `CA-n: <scenario title>` (title **verbatim** from
> this section). The mapping is enforced by a guard test (`stress-mapping-guard.test.ts`,
> stdlib of the existing test framework): every CA has at least one test prefixed with its
> canonical title, no dead `CA-n:` name survives, and no title drifts from this spec — a
> rename without a spec change fails the unit suite (B.2, PO decision 2026-11-09). No Gherkin
> runner is introduced: the Gherkin is the language of the spec, the tests stay in the
> project's existing framework (no test dependency).

### CA-1 — Deterministic generation

```gherkin
Scenario: The same (scenarios, steps, seed) produces byte-identical files
  Given the generator parameters (scenarios 10, steps 10, seed 42)
  When the generator is run twice into two isolated output directories
  Then the produced files are byte-identical
```

### CA-2 — Parseable shape

```gherkin
Scenario: The generated workspace carries exactly N scenarios, N x M steps and 100 definitions
  Given the generated workspace (scenarios 10, steps 10)
  When the generated .feature is parsed by the product Gherkin parser and the .php is scanned by the product PHP scanner
  Then the feature parses successfully and carries exactly 10 scenarios and 100 steps
  And the PHP context carries exactly 100 step definitions
```

### CA-3 — Full matching

```gherkin
Scenario: Every generated step matches exactly one generated definition
  Given the generated workspace (scenarios 10, steps 10)
  When the product index is built from its steps and its definitions
  Then every step matches exactly one definition
  And there is no undefined step, no orphan definition and no duplicate group
```

### CA-4 — No crash + functional at scale

```gherkin
Scenario: The full-scale workspace is indexed without crash and the probe resolves to exactly one definition
  Given the generated full-scale workspace (scenarios 1000, steps 1000, 100 definitions)
  And the extension running in a real VS Code instance on that workspace
  When the probe step "step 1 of scenario 1" is resolved
  Then the extension host is alive and the index is built
  And the probe resolves to exactly 1 definition location
  And the stress feature carries zero diagnostics
```

### CA-5 — Wall-time budget

```gherkin
Scenario: The first probe resolution stays within the locked wall-time budget
  Given the generated full-scale workspace (scenarios 1000, steps 1000)
  And the extension running in a real VS Code instance on that workspace
  When the probe step "step 1 of scenario 1" is resolved for the first time
  Then the wall time from the stress run start (inside the extension host) to that first resolution is at most the locked budget (below)
  And a breach is a performance regression (BLOQUANT), never a spec tweak
```

### CA-6 — Restart

```gherkin
Scenario: After a fresh launch the index rebuilds and the probe still resolves
  Given a first successful stress run on the full-scale workspace
  When a fresh VS Code instance starts on the same workspace
  Then the index rebuilds on activation
  And the probe step resolves again to exactly 1 definition location
```

### CA-7 — Zero new runtime dependencies

```gherkin
Scenario: The generator uses Node stdlib only and adds no runtime dependency
  Given the stress generator source and the package.json
  When the generator imports are inspected
  Then the generator imports Node builtins only
  And the extension runtime dependencies are unchanged (@cucumber/gherkin, @cucumber/messages)
```

### CA-8 — Zero personal data, English

```gherkin
Scenario: The generated content is deterministic English boilerplate with zero personal data
  Given the generated full-scale workspace
  When its files are inspected
  Then every line is deterministic English boilerplate (no personal data, no non-ASCII)
```

## 3. Named decisions

| Name | Decision |
|---|---|
| `scale` | 1000 × 1000 = 1000 scenarios × 1000 steps per scenario, **single `.feature`** (~1 M steps, ~42 MB) — a pipeline ceiling (parse → index → match → window health), not disk I/O |
| `smoke` | 100 × 100 (~5 MB) for push/PR CI |
| `shape` | step text `step <j> of scenario <s> variant <v>` with `v = (s × M + j) mod 100`; keywords rotate Given/When/Then by `(j + seed mod 3) mod 3` (type-agnostic matching exercised; the seed shifts the rotation, so the output is a function of `(scenarios, steps, seed)`); **no** `# language:` header (the EN default-dialect path at scale); PHP side = one context class `StressContext`, 100 methods `step0`…`step99`, method k carries the pattern `/step (?P<j>\d+) of scenario \d+ variant (k)$/` — the trailing `$` before the closing delimiter (unanchored Behat semantics, end-of-subject only) makes each step match exactly one definition (CA-3) |
| `budget` | **locked after the first GREEN** (F3): measured baseline (full scale, first GREEN run) → `budget = ceil(baseline × 3, 5 s)`, asserted in `suite-stress.mjs`. Baseline: `____ s` (measured 2026-11-09) → budget: `____ s` — **PO signature of the number: ______** |
| `margin` | ×3 over the measured baseline (CI runner variance), rounded up to 5-second units |
| `vehicle` | generator invariants (CA-1, CA-2, CA-3, CA-7, CA-8) in the fast vitest loop **at small scale** (10 × 10 — the loop stays fast); CA-4/CA-5/CA-6 as an e2e scenario in the test-electron harness (the 2-launch pattern serves CA-6) |
| `placement` | `test/stress/` — generator `generate-stress.mjs` + this spec + unit tests + the e2e runner/suites; generated output in `test/stress/generated/` (**gitignored, never committed**) |
| `invocation` | `node test/stress/generate-stress.mjs --scenarios N --steps M --seed 42 --out test/stress/generated` · package script `pnpm test:stress` (generate + run the stress e2e) · scale override via env `STRESS_SCENARIOS` / `STRESS_STEPS` (the CI smoke sets 100/100; default 1000/1000) |
| `naming` | test name = `CA-n: <scenario title>` (title verbatim from §2) — enforced by the mapping guard test (`stress-mapping-guard.test.ts`): every CA has ≥ 1 test with its canonical title, no dead `CA-n:` name, no title drift (B.2, PO decision 2026-11-09) |
| `diagnostics-flood` | the 1 M **undefined**-steps case (diagnostic flooding) is **not** this stress — it is a chat-noir crash case in `qa/crash-cases/`; expected behavior: no crash, behavior documented |

## 4. Non-negotiables

- Deterministic output (fixed seed 42 by default) — reproducible in CI, diffable.
- No network, no real clock, no unseeded randomness.
- Zero personal data, EN content (public repo).
- Generated artifacts never committed.
- No new runtime dependency; generator = Node stdlib only.
- The stress must never tune product code to pass — a budget breach is a **product finding**, not a spec tweak.

## 5. Community use

Yes — by nature: the stress is product test content that ships in the public open-source repo
(MIT, with the repo). Open-source-ready from day 1: fully parameterizable (`--scenarios /
--steps / --seed / --out`), zero personal paths, EN, clone-and-run
(`node test/stress/generate-stress.mjs --help`).

## 6. Open questions

- — none — every decision above is a named default, overridable by the PO at validation.

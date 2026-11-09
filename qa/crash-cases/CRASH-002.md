# CRASH-002 — Nested-quantifier regex: multi-minute extension-host freeze

- **Status**: run 2026-11-09 — **freeze reproduced** (76 s host-wide unresponsiveness, deterministic)
- **Source**: chat-noir discovery, QA cycle 2026-11-09, step 3 (fresh-context field
  « regex pathologiques »).

## Trigger

Minimal input — one PHP file, one feature file:

```php
<?php
class BacktrackSteps
{
    /**
     * @Given /^(\w+)+$/
     */
    public function nestedQuantifier()
    {
    }
}
```

```gherkin
Feature: Backtrack

  Scenario: killer
    Given aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!
    Given aaa
```

The step text is 40×`a` + a trailing `!` (41 chars). The pattern is perfectly
legal Behat/PCRE (nested quantifiers are legal — Behat's own `preg_match`
would do the same backtracking at runtime).

Launch: VS Code test instance on that 2-file workspace (see Trace for the
exact command).

## Expected behavior (documented)

- The extension host must stay **responsive**: one user-controlled regex and
  one 41-char step line must not be able to freeze the host for minutes
  (the rebuild runs synchronously on the extension host main thread —
  `buildIndex` is O(steps × definitions) of `RegExp.test` calls).
- No crash; the step either matches or is diagnosed as undefined.

## Trace

Run 2026-11-09 (chat-noir). VS Code 1.145.2 test instance, embedded Node 24
extension host. Linux x64, 16 cores.

### In-host observation (VS Code launch, workspace `ws-backtrack/`)

| Fact | Value |
|---|---|
| Extension activated | +101 ms (normal) |
| Diagnostics while building | 0 at +101 ms → **nothing for 76.2 s** (the suite's 1 s polling timer could not tick — the extension host event loop was blocked: log gap `+101 ms` → `+76345 ms`) |
| Diagnostics after the regex completes | 1 ERROR (the killer step — undefined: the pattern cannot match a trailing `!`); the `aaa` step matched, no diagnostic |
| Definition probe on the killer step line | resolved, 0 locations, no exception |
| Extension host exit | code 0 (the host survived the freeze) |
| runTests wall | 78.6 s |

Freeze duration ≈ **76 s of total unresponsiveness** for a 41-character step
line and a single definition. Every launch (and every rebuild triggered by a
file change) on a workspace containing this pair repeats it — deterministic.

### Isolation (pure core, no VS Code — Node 22.14.0)

Direct `RegExp` measurement, `new RegExp("^(\\w+)+$", "u").test(subject)` with
`subject = "a".repeat(n) + "!"`:

| n (a's) | time (Node 22.14.0) |
|---|---|
| 30 | 47 994 ms |
| 34 | 58 639 ms |
| 38 | **942 481 ms (≈ 15.7 min)** |
| 40 | ≈ 63 min (extrapolated — not measured, timebox) |

`buildIndex` over the 2-step workspace with the same definition: n=30 →
52 000 ms (parse + scan are negligible).

**Cost model from the measured points** — the growth is **not a single curve;
it is engine- and length-dependent**:

- n=30→34: near-linear (48 s → 58.6 s).
- n=34→38: **×16.07 over 4 chars — 2.00× per added char (measured)**. This
  matches the pattern's search space: `(\w+)+` over n `a`s has 2^(n−1)
  decomposition paths, and the trailing `!` guarantees the match fails — the
  backtracker explores them all.
- Extrapolation of the measured 2×/char ratio (Node 22): n=40 ≈ 63 min,
  n=45 ≈ 1.4 days, n=50 ≈ 44 days, n=55 ≈ 154 days.

The **embedded host engine differs from the isolated one**: the same 41-char
line (40×`a`+`!`) froze the host **76.2 s on VS Code's Node 24.22.1** (in-host
measurement above) where it extrapolates to ≈ 63 min on Node 22.14.0. The V8
version moves the absolute cost by ~40× here, but not the phenomenon: a
41-character user line freezes the entire extension host for 76 s on the host
engine, and `.feature` lines have no practical length limit — the scaling knob
is user-controlled.

### Post-restart

Two fresh launches measured on the same workspace — the freeze reproduces
on every start (the rebuild re-runs the same matching):

| Launch | Diagnostics 0 → 1 at | Freeze window | Exit |
|---|---|---|---|
| 1st | +101 ms → +76 345 ms | ≈ 76.2 s | 0 |
| 2nd | +104 ms → +78 090 ms | ≈ 78.0 s | 0 |

No corrupt residue: after the freeze the index is correct (1 ERROR — the
killer step undefined; `aaa` matched, no diagnostic) and the host exits 0.

## Verdict (facts only)

Freeze found, reproduced, isolated to the core matcher (`RegExp.test` on a
nested-quantifier pattern). Growth in subject length: near-linear up to
n≈34, then **2× per added char (measured n=34→38: ×16.07)** on Node 22.14.0 —
the exponential search space of `(\w+)+` on a failing match. No crash, no
corruption — the host survives and recovers once the regex finishes, but the
window of total unresponsiveness is arbitrarily long by user input (76.2 s
measured for a 41-char line on the host engine; ≈ 15.7 min measured for 38
a's on Node 22.14.0 in isolation).

# CRASH-001 — 1M undefined steps (diagnostics flood)

- **Status**: run 2026-11-09 — **no crash, no freeze** (see Trace)
- **Source**: `test/stress/stress-spec.md` §3 `diagnostics-flood` — the 1M
  undefined-steps case is a chat-noir crash case, **not** part of the stress
  (the stress asserts the fully-matched workspace; this case inverts it: the
  same 1M steps, zero definitions).

## Trigger

1. Generate the full-scale stress fixture:
   `node test/stress/generate-stress.mjs --scenarios 1000 --steps 1000 --seed 42 --out /tmp/crash-001`
2. Remove the PHP context so every step is undefined:
   `rm /tmp/crash-001/StressContext.php`
3. Launch the extension on that workspace (test-electron, as `pnpm test:stress`
   does — a suite that waits for the index build, then probes) and let the
   index build.
4. Kill it and start a **fresh instance** on the same workspace (post-restart
   check).

Workspace shape: `stress.feature` = 1000 scenarios × 1000 steps (~42 MB,
1M steps), no `.php` file → all 1M steps undefined, 0 definitions.

## Expected behavior (documented — the run verifies it)

- **No crash**: the extension host survives parse → index → publication of
  1M `vscode.Diagnostic` objects (ERROR severity, one per step line —
  `publishDiagnostics` builds them in one array and `collection.set`s per
  file) and stays responsive afterwards.
- **Navigation degrades, does not break**: a definition probe on any step
  line resolves to **0 locations** (the step is undefined — the provider must
  return empty, not throw).
- **Restart**: the fresh instance rebuilds the index and re-publishes the
  same 1M diagnostics (state reconstructed, no corrupt residue).
- **Documented slowness**: building and publishing 1M diagnostics is a heavy
  operation (memory + wall time). The measured wall time is reported in the
  trace. **Slow-but-alive passes**; a freeze (no progress for > 10 min) or a
  crash fails the case.

## Trace

Run 2026-11-09 (chat-noir, QA cycle 2026-11-09, step 3). VS Code 1.145.2 test
instance (`@vscode/test-electron` 3.1.0, 2 sequential launches = first launch +
faithful fresh restart per SPEC §7). Linux x64, Node 22.14.0 extension host.

### Minimal input

```
node test/stress/generate-stress.mjs --scenarios 1000 --steps 1000 --seed 42 --out <ws>
rm <ws>/StressContext.php        # 0 definitions → every step undefined
```

Workspace: one 43 043 923-byte `stress.feature` (1 001 002 lines, 1 000 000
steps), no `.php` file.

### Command

```
node run-crash-001.mjs   # 2× runTests({extensionDevelopmentPath: <repo>, launchArgs: [<ws>,
                         #   --disable-telemetry, --disable-workspace-trust,
                         #   --skip-welcome, --skip-release-notes]})
```

Suite contract: wait activation → poll `getDiagnostics(stress.feature).length`
until stable (30 s no-change window, 25 min cap) → `vscode.executeDefinitionProvider`
on the step line "When step 1 of scenario 1 variant 1" (line 3, 0-based) →
exit → fresh second launch, same workspace, same contract.

### Phase 1 — first launch

| Fact | Value |
|---|---|
| Extension activated | +206 ms (since suite load) |
| Diagnostics jump | 0 → **1 000 000** at **+2 560 ms** (RSS 712 MB at that instant) |
| Diagnostics count | exactly 1 000 000 (one ERROR per step) — no crash, no truncation |
| Stability | 30 s no-change window reached; total wait 32 673 ms |
| Wall time (suite load → stable) | 33 001 ms — incl. 30 s stability window; publish itself ~2.6 s |
| Peak RSS observed | 773 MB (extension host) |
| Definition probe on the step line | resolved, **0 locations**, no exception |
| Definition probe on the `Feature:` line | resolved, 0 locations, no exception |
| Extension host exit | code 0 (clean) |
| runTests wall | 39.9 s (incl. ~6 s VS Code startup) |

No 10-min stall (progress within 2.6 s) → no freeze. Note: the publish is far
cheaper than the matched stress baseline (17.9 s): with 0 definitions the
O(steps × definitions) matching loop does zero work — the measured cost is
parse (43 MB) + building 1M `vscode.Diagnostic` objects + one
`collection.set` per file.

### Phase 2 — fresh launch (post-restart, same workspace)

| Fact | Value |
|---|---|
| Extension activated | +105 ms |
| Diagnostics jump | 0 → **1 000 000** at +2 492 ms |
| Diagnostics count | exactly 1 000 000 again — state reconstructed, no residue |
| Wall time (suite load → stable) | 32 709 ms |
| RSS | 575–782 MB |
| Definition probe on the step line | resolved, **0 locations**, no exception |
| Extension host exit | code 0 (clean) |
| runTests wall | 35.6 s |

### Verdict (facts only)

No crash, no freeze, no corruption: both the first launch and the fresh
restart publish exactly the 1M ERROR diagnostics and keep the definition
provider functional (0 locations, no throw). Slow-but-alive — and in fact
fast (~2.6 s to publish) on this machine.

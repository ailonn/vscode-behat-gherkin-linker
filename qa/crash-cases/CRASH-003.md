# CRASH-003 — Unreadable `.feature` file: silent total index loss at window load

- **Status**: run 2026-11-09 — **state loss reproduced** (no crash, no freeze,
  zero user-visible feedback; self-heals on the next file event — measured)
- **Source**: chat-noir discovery, QA cycle 2026-11-09, step 3 (fresh-context
  field « IO / filesystem »).

## Trigger

A `.feature` file the extension host process cannot read. Reproduced with a
workspace file `chmod 000` (the host runs as the same user — an unreadable
file *for the process*). Equivalent production triggers: a file owned by
another user without read permission, an NFS/permissions failure, a file that
becomes unreadable while the window is open.

Fixture (deterministic, `ws-io-noperm/`):

- `noperm.feature` — `chmod 000`; contains one **undefined** step
  (`Given noperm step` — no matching definition by fixture design)
- `valid2.feature` — control file; its step matches a definition
- `Valid2Steps.php` — defines only `io control step`

Expected state if the file were readable: 1 ERROR (the undefined step in
`noperm.feature`), 0 elsewhere.

## Expected behavior (documented)

One unreadable file must not disable the index for the whole workspace, and a
failure that cannot be completed must be announced with a reason — an
extension-host log line is not user-visible feedback (no diagnostic, no
notification, nothing).

## Trace

Run 2026-11-09 (chat-noir). VS Code 1.145.2 test instance, embedded
Node 24.22.1 extension host. Two launches: the original solo run, then a
5-phase recovery run on the same fixture.

### First build (window load, file unreadable)

| Fact | Value |
|---|---|
| Extension activated | +319 ms (normal) |
| First rebuild | `readFile` on `noperm.feature` → `EACCES` → the `rebuild()` promise rejects; `activate` calls `void svc.rebuild()` — no catch |
| Unhandled rejection | **log-only** (extension host log, never surfaced in the UI): `rejected promise not handled within 1 second: NoPermissions (FileSystemError): Error: EACCES: permission denied, open '…/noperm.feature'` + stack trace |
| Diagnostics, whole workspace | **0** — the index stays `null`: the readable control file's navigation is dead *and* the undefined step in `noperm.feature` is not flagged |
| Definition probe, control step line | `{ok: true, count: 0}` — no exception, zero locations (the provider returns `[]` when `index === null`) |
| Extension host exit | code 0 — no crash, no freeze |

Outcome: **one unreadable file empties the index for the entire workspace,
silently** — go-to-definition / references / hover all do nothing, no
diagnostic anywhere, no notification. The only trace of the failure is the
dev-log unhandled rejection.

### Recovery (second launch, 5 phases, same fixture)

| Phase | Action | Result (diagnostics, measured) |
|---|---|---|
| 0 | fresh launch, file still 000 | dead state re-confirmed: 0 diagnostics workspace-wide |
| 1 | `chmod 644` **only** — no content change | **index recovers**: the watcher's `onDidChange` fires on the permission change → rebuild succeeds → `noperm.feature` now flagged 1 ERROR (its undefined step), control file 0 |
| 2 | append to `valid2.feature` | stable (1 ERROR — as expected for the fixture) |
| 3a | re-break: `chmod 000` + edit | rebuild fails again (a new unhandled rejection in the log) — but the **last good state is kept**: diagnostics persist (1 ERROR), the index is not cleared. While the file stays unreadable, every subsequent rebuild fails — the index is frozen and edits to other files are silently not indexed |
| 3b | delete `noperm.feature` + edit | rebuild succeeds; consistent state (0 diagnostics — everything matches) |

Mechanism (from `src/extension/activation.ts`):

- `rebuild()` has **no per-file error handling**: one `readFile` rejection
  rejects the whole rebuild (the `await vscode.workspace.fs.readFile(file)`
  inside `collect()` is uncaught).
- Both call sites are uncaught: `activate` → `void svc.rebuild()` and the
  watcher's `schedule()` → `void this.rebuild()` — every failed rebuild is an
  unhandled promise rejection (logged, never surfaced).
- A failed rebuild leaves `this.index` untouched (last-good state kept) —
  except when it is the **first** build: then the index is `null` → 0
  diagnostics, dead navigation, zero feedback.

### Post-restart

A fresh launch with the unreadable file still present reproduces the dead
state deterministically (phase 0). A window reload alone does not fix it while
the file remains unreadable; the **first file event** — even a permission-only
change, no content edit needed — triggers a rebuild that restores the index
(phase 1). Deletion of the offending file + any file event also recovers
(phase 3b).

## Verdict (facts only)

No crash, no freeze — but **silent state loss**: one unreadable `.feature`
file empties the workspace index at window load with no diagnostic, no
notification and no error in the UI; the failure exists only as an unhandled
rejection in the extension host log. The state self-heals on the next file
event (measured — phase 1) and later failed rebuilds keep the last good state
(measured — phase 3a), but the user has no way to know the index is dead at
load or frozen afterwards.

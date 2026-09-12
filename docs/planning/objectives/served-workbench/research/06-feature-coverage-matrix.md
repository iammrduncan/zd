# Feature coverage matrix

Date: 2026-09-12

Status: **Executed.** Every row carries test evidence, a manual/protocol-level observation from this
audit, or an explicit gap. "Unit" = Vitest under `packages/app/tests/unit`; "host" = Rust tests under
`packages/host/{src,tests}`; "server" = Rust tests under `packages/server/tests`; "served e2e" =
Playwright Chromium against a real host (`packages/app/tests/served`); "audit" = this audit's
protocol-level fixture runs (evidence under `/tmp/zd-audit/evidence`, harness under
`/tmp/zd-audit/bin`).

## Platform coverage at a glance

| Platform | Status |
| --- | --- |
| Linux host + Chromium | **Covered** — unit, host, server, served e2e, audit protocol runs |
| Linux host + Firefox | **Gap** — served e2e is Chromium-only (`playwright.served.config.ts`); no Firefox run exists |
| Linux host + Playwright WebKit | **Gap** — WebKit is installed (`webkit-2359`) but no served config drives it |
| Native macOS Tauri | **Deferred by owner decision** — recorded gap, no evidence claimed |
| Windows | **Deferred** — out of scope per the audit plan |
| Tailscale / protected network | **Covered (partial)** — pairing verified over the live tailnet (`:45027`, secret path) and fixture latency sampled on the tailnet bind; no Playwright run over tailnet |

## Capability matrix

### Connection and session

| Capability | Evidence | Notes |
| --- | --- | --- |
| First pairing, secret → cookie | server `protocol.rs` tests; audit `pair()` probe (204/403 observed) | — |
| Remembered credential across reload/restart | served e2e `real-host` "hands a paired workbench to a new page"; pairing token persisted in state dir | — |
| Expiry/revocation | unit `served-unlock`, `served-client` tests | server-side revocation path exists |
| Reconnect feedback + bounded reconnect | unit `served-client`/`served-adapter`; audit 10× WS + stall rows | — |
| Stale controller recovery / replacement | audit `controller` row: `controller-replaced` + stale writes refused | — |
| Heartbeat liveness bound | audit stall rows: socket dead at 30 s; fresh auth restores | — |

### Projects, picker, files

| Capability | Evidence | Notes |
| --- | --- | --- |
| Project grants / approve / remove | host `service.rs`, `workspaces.rs`; audit reattach rows | — |
| Remote project picker (browse/scroll/select/cancel) | unit `remote-project-picker`; served e2e `real-host` "opens a remote folder beside the current project" | no e2e for very long lists |
| File tree snapshot + watch | host `file_tree*`; served e2e `file-tree.spec` (5 tests); audit watch-restart row | — |
| File read/write/mutate | host `file_authority`; served e2e new-file typing + save | bounded reads enforced (`file.readBounded`) |
| Hostile paths / grants enforcement | host `file_authority.rs` tests | — |

### Editor and Git

| Capability | Evidence | Notes |
| --- | --- | --- |
| Open/edit/save/reopen Markdown | served e2e file-tree spec; unit editor suite (107 unit files) | blank-editor regression fixed at `2b58d97` |
| Git status/history/diff/compare | host `git_service.rs` tests | no served e2e Git row — unit+host only |
| Dirty-buffer context switch, external changes | unit workbench tests; file-tree watcher e2e | — |
| Clipboard + project images | unit `clipboard-image`; `image.*` protocol ops in server tests | — |

### Terminals

| Capability | Evidence | Notes |
| --- | --- | --- |
| Start/write/read/resize/dispose/exit | audit protocol rows + host `terminal.rs` + e2e real-host | all observed on the real path |
| Reconnect restoration (same session/PID) | audit 10×+10× rows; e2e real-host reattach + offline rows | PID + nonce verified, not PID alone |
| Survive server SIGTERM/SIGKILL/restart | audit rows; e2e real-host restart spec (native) | e2e row **fails inside Podman** (F-05) |
| UTF-8 / ANSI / alt-screen / cursor modes | audit utf8 row (split 4-byte char, 1049h/l) | — |
| Bounded output + truncation signal | audit flood rows: 8.6 MiB in → 4 MiB retained, `droppedBefore` set | — |
| Slow consumer | audit slow-consumer row: client never reads, stays responsive | — |
| Job-control background children on dispose | **F-01 — fails**: orphan survives, dispose errors, record leaks | gap: no interactive-shell test |
| Multiple terminals/panes | e2e real-host restart spec covers multi-pane | — |
| Bracketed paste, IME, search, scrollback, copy | unit terminal tests only — **no served-path evidence** | row gap for remote input fidelity |

### Workbench and shell

| Capability | Evidence | Notes |
| --- | --- | --- |
| Threads create/rename/reorder/close | unit workbench tests | no served e2e row |
| Project/worktree switch | unit + e2e remote-folder test | — |
| Layout restore across process+origin | e2e real-host "restores stable identities…in a new process and origin" | — |
| Banners/dialogs/notifications/quick access | unit tests | served-path gap |
| Command routing, keyboard access, a11y names | unit `shortcuts`, form-identities e2e | — |
| Shipped themes | unit + `theme.list` op | — |
| Desktop-only unavailable states | unit `desktop-served` | — |

### Security and resource limits

| Capability | Evidence | Notes |
| --- | --- | --- |
| Keeper socket perms 0600 / dir 0700 / lock | code + audit fixture inspection | — |
| Same-user peer authority | `socket_security.rs` (17 tests) | — |
| Origin/authority + credential checks | `socket_security`, `http`, `protocol` tests; audit pair probe | — |
| Controller fencing | audit row (same server); **F-03: none across servers** | — |
| Frame/input/output bounds | 64 KiB input cap, 64 MiB WS frame cap, 4 MiB output cap — all observed | — |
| Heartbeat bounds in-flight work | `before_heartbeat_timeout` + audit stall rows | — |
| Content-free diagnostics retention | host `instrumentation*` tests | — |
| Keeper protocol version | **F-04: no handshake** — `deny_unknown_fields` breaks on schema change | — |

### Delivery

| Capability | Evidence | Notes |
| --- | --- | --- |
| Packaged assets match binary | `package.sh` + layout tests; audit notes the container path | — |
| CLI and wrapper share backend | `zd-serve`/`zd` share `run_foreground`; Tauri supervises the binary | native Tauri run unverified (deferred) |
| Startup/shutdown/upgrade | audit restart rows; **upgrade wire-compat = F-04** | — |
| User docs match verified behavior | `cli.md` updated with `--secret`; docs tests green | — |

## Verified prior symptoms

| Symptom | Result |
| --- | --- |
| Blank Markdown editor | fixed at `2b58d97`; covered by file-tree spec |
| Terminal lost on server restart | **cannot reproduce as a defect** — survives by design; e2e + audit rows pass |
| Podman suite failures | environment-specific (F-05), reproduced on pre-change code |
| Stale `failed` thread hides live session | covered: `terminal-restoration` spec passes |

## Missing coverage — explicit gaps

1. **Firefox and WebKit on the served path** — no config or run exists.
2. **Native macOS Tauri evidence** — owner-deferred; recorded, not claimed.
3. **Terminal input fidelity over the wire** — bracketed paste, IME composition, key ordering, and
   copy/selection are unit-tested only; no served-path test types them end to end.
4. **Git e2e on the served path** — host-level tests only.
5. **Long project-picker lists** — unit-tested; no e2e scroll evidence.
6. **Cross-server input fencing** — F-03: by-design gap or defect, owner decision needed.
7. **Keeper upgrade path** — F-04: no compatibility handshake to test.
8. **The `pollExit` pump contention** — F-06: worth a contention test once the pump changes.

# Served workbench

**Phase:** Executing
**Started:** 2026-08-31

This objective makes one `zd` host authoritative for browser and Tauri clients. It replaces a future
choice between custom SSH application messages and a second browser backend with one directly
reachable served host and one observable protocol.

## Needs the owner

Nothing. The owner deferred native Windows process-containment execution to Goal 05. Goal 03 is
complete on its Linux, Unix-process, and real-browser evidence, and Goal 04 is ready to start.

## Plan documents

| # | Document | What it decides |
| --- | --- | --- |
| 00 | [Diagnosis](00-DIAGNOSIS.md) | What exists, what is not duplicated, and why this is more than one simple change |
| 01 | [Target architecture](01-TARGET-ARCHITECTURE.md) | Host/client-shell split, WebSocket, security, persistence, observability, and process topology |
| 02 | [Delivery plan](02-DELIVERY-PLAN.md) | Five ordered work packets, evidence gates, relative change surface, and exclusions |
| 03 | [Decisions and gaps](03-DECISIONS-AND-GAPS.md) | Authority changes, applied decisions, deferred gaps, and stop conditions |

## Research

[`research/`](research/README.md) establishes the current platform boundary, safe remote profile, Tauri lifecycle
constraints, origin-persistence problem, and missing browser-to-real-host evidence.

## Goals

**Open**

| Goal | Delivers | Prerequisites | Needs owner |
| --- | --- | --- | --- |
| [Execute goal 04](goals/execute-goal-04.md) | Stable `zd serve` CLI and a literal supervised Tauri client shell | Goal 03 | No |
| [Execute goal 05](goals/execute-goal-05.md) | Verified macOS, Windows, and Linux release artifacts | Goal 04 | No |

**Completed**

| Goal | Summary | Outcome |
| --- | --- | --- |
| [Execute goal 00](goals/_completed/execute-goal-00.md) | [Summary](goals/_completed/summary-goal-00.md) | One authenticated read-only served host opens a real project file in a real browser. |
| [Execute goal 01](goals/_completed/execute-goal-01.md) | [Summary](goals/_completed/summary-goal-01.md) | Stable identities and host-owned workbench state survive a new process, port, origin, and secret. |
| [Execute goal 02](goals/_completed/execute-goal-02.md) | [Summary](goals/_completed/summary-goal-02.md) | A browser connects directly and edits through one durable, grant-scoped file/Git host. |
| [Execute goal 03](goals/_completed/execute-goal-03.md) | [Summary](goals/_completed/summary-goal-03.md) | Host-owned watches and terminals reconnect without duplicate processes and expire with explicit loss. |

## What this objective will not do

- Build an SSH client, remote installer, cloud service, account system, or collaboration model.
- Claim plain HTTP is safe on the public Internet or trust reverse-proxy identity.
- Give a browser arbitrary roots, paths, commands, executables, arguments, or environment access.
- Add a second filesystem, Git, watcher, or terminal implementation.
- Move the frontend's runtime workbench-transition owner into the server.
- Publish behavior in released user documentation before its packaged evidence passes.

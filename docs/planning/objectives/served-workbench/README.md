# Served workbench

**Phase:** Planning
**Started:** 2026-08-31

This objective makes one `zd` host authoritative for browser and Tauri clients. It replaces a future
choice between custom SSH application messages and a second browser backend with a loopback served
host, a standard protected tunnel, and one observable protocol.

## Needs the owner

Nothing is waiting on an owner decision. The read-only walking skeleton proved the accepted
loopback, single-controller, shared-host direction. Its evidence now fixes the public host and
protocol shapes needed to cut the remaining work packets.

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

None while the remaining work packets are converted into executable goals.

**Completed**

| Goal | Summary | Outcome |
| --- | --- | --- |
| [Execute goal 00](goals/_completed/execute-goal-00.md) | [Summary](goals/_completed/summary-goal-00.md) | One authenticated read-only served host opens a real project file in a real browser. |

## What this objective will not do

- Build an SSH client, remote installer, cloud service, account system, or collaboration model.
- Listen directly on a LAN or public interface or trust reverse-proxy identity.
- Give a browser arbitrary roots, paths, commands, executables, arguments, or environment access.
- Add a second filesystem, Git, watcher, or terminal implementation.
- Move the frontend's runtime workbench-transition owner into the server.
- Publish behavior in released user documentation before its packaged evidence passes.

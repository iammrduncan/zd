# Terminal workbench objective

Status: **complete**

Started: 2026-09-26

## Objective

Archive the browser/Tauri product as v0 and deliver a native Rust v1.0.1 TUI prototype for file
navigation, project search, code/Markdown editing, Markdown reading, source-backed review, external
agent handoff, and image-link insertion.

The owner's words remain in [objective.md](objective.md).

## Plan

| Document | Purpose |
| --- | --- |
| [Diagnosis](00-DIAGNOSIS.md) | Why an incremental browser-to-TUI adjustment or editor fork is the wrong boundary |
| [Product and architecture](01-PRODUCT-AND-ARCHITECTURE.md) | Vocabulary, product boundary, state ownership, and deep modules |
| [Delivery plan](02-DELIVERY-PLAN.md) | Five ordered phases, effort, risks, and exclusions |
| [Decisions and gaps](03-DECISIONS-AND-GAPS.md) | Owner decisions, successor ADRs, and non-blocking unknowns |
| [Acceptance plan](04-ACCEPTANCE-PLAN.md) | Automated and live evidence required for handoff |
| [Research](research/README.md) | Compiled findings and unedited specialist evidence |

## Strategic call

Build one focused MIT Rust TUI on Ratatui/Crossterm with an application-owned Ropey document model.
Use editors as interaction evidence, not product bases. Integrate with Herdr for agent discovery and
handoff; do not own PTYs, shells, sessions, or serving.

## Phase

Research, planning, and all five execution goals are complete:

1. [Archive v0 and make the Rust TUI root authoritative](goals/_completed/summary-goal-00.md) — complete.
2. [Own document editing and workspace navigation](goals/_completed/summary-goal-01.md) — complete.
3. [Deliver the terminal editor and Markdown reader](goals/_completed/summary-goal-02.md) — complete.
4. [Connect source review, Herdr handoff, and image paste](goals/_completed/summary-goal-03.md) — complete.
5. [Verify and hand off the v1.0.1 prototype](goals/_completed/summary-goal-04.md) — complete.

They were serialized because each later goal consumed shared root state and app/core files from the
previous one.

## Needs the owner

Run the final Ghostty/Herdr and same-host clipboard checklist on macOS. Automated, Linux, and
read-only live Herdr evidence is complete; the platform-specific observation remains explicitly
open.

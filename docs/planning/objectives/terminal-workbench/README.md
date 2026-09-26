# Terminal workbench objective

Status: **executing**

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

Research and planning are complete. Goal 00 is complete and Goal 01 is next:

1. [Archive v0 and make the Rust TUI root authoritative](goals/_completed/summary-goal-00.md) — complete.
2. [Own document editing and workspace navigation](goals/execute-goal-01.md).
3. [Deliver the terminal editor and Markdown reader](goals/execute-goal-02.md).
4. [Connect source review, Herdr handoff, and image paste](goals/execute-goal-03.md).
5. [Verify and hand off the v1.0.1 prototype](goals/execute-goal-04.md).

They are serialized because each later goal consumes shared root state and app/core files from the
previous one. None needs owner input before starting.

## Needs the owner

Nothing before goals or implementation. The final Ghostty/Herdr experience and same-host clipboard
image behavior require owner-side acceptance after the automated and Linux/Herdr gates pass.

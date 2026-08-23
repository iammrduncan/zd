# Mini-apps ideas summary

Archive status: consolidated

Disposition: not pursued — superseded on 2026-08-22 by the
[one-workbench execution plan](../../goals/expanded-scope/goal.md)

The mini-apps objective collected early product exploration from when ZenSuite was imagined as a
family of small, separately launched applications sharing one zen visual language. The direction
was retired in favour of the single `zd` workbench, which absorbed the useful behavior (projects,
threads, terminals, files, Git, editor) behind one window and one design system.

## The seven ideas

- **zd-studio** — a single dashboard view launched by bare `zd`, hosting the other mini apps in one
  context, with `zd .` opening the current folder as a project and a home screen of recent work.
  Superseded directly by the workbench itself.
- **zd-terminal** — an in-app terminal (libghostty-vt) toggled by in-app and global hotkeys, with
  tabs, split panes, and agent-status monitoring. Largely realized as workbench terminal threads
  and the quick-access global shortcut.
- **zd-td** — a todo.txt-first CLI and zen text UI: priorities, tags, reports, local or global todo
  files, plus a bounded metadata scheme (description and change-request sidecar files keyed by
  `@m:<id>` / `@cr:<id>` line ids), agent "claimed" tagging to avoid races, and standardized
  progress states (todo, in progress, in review, change requested, done).
- **zd-bdd** — a BDD development editor over `docs/bdd/`, seeded by `zd init`, with two modes: a
  block-by-block reader in the zd md style and a grapher showing a dependency graph of BDD items
  with last-check pass/fail marks and in-place node editing.
- **agent-setup** — an extension of `zd init` that scaffolds `CLAUDE.md` → `AGENTS.md`, a
  `/docs/goals/` structure, a standard Claude Code status line, and a `zd goal <name>` template
  (research/, goal.md, goal-bdd.md, goal-research.md, initial_thoughts.md, resources/).
- **zd-mcp** — MCP coverage across the suite so agents could drive every app feature a human could.
- **mermaid-rendering** — beautiful Mermaid diagram rendering (in the vein of the
  `beautiful-mermaid` package).

## Why it stopped

The multi-app shape multiplied surfaces, launch modes, and state owners. The expanded-scope plan
chose one workbench with one design contract instead. Several seeds survived in workbench form
(terminal threads, quick access, the design system); the rest — td, bdd, mcp, agent scaffolding,
Mermaid rendering — remain possible future features of the one app, not separate products.

The original `initial_thoughts.md` files and the agent-setup resource templates (standard
`AGENTS.md`, `CLAUDE.md`, status line script) remain available in repository history at the commit
that removed `docs/planning/objectives/mini-apps/`.

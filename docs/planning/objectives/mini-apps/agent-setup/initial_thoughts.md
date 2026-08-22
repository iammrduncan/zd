> Historical idea, superseded on 2026-08-22. It does not direct current implementation; see the
> [one-workbench execution plan](../../../goals/expanded-scope/goal.md).

agent setup is extension of `zd init`.

it creates `CLAUDE.md` with one line `@AGENTS.md` and then creates `AGENTS.md` with our standard `AGENTS.md` prose. It then creates the `/docs/goals/` folder with a `README.md` that describes how to use goals and the flow.

it creates a claude status line file from our standard one and updates claude code settings to include it, if a standard status line does not already exist in repo or in user settings.

using `zd goal <name>` will create ours tandard goal structure of:

- research/
  - .gitkeep
- goal.md
- goal-bdd.md
- goal-research.md
- initial_thoughts.md
- resources/
  - .gitkeep

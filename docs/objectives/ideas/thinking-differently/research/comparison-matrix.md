# Cross-candidate comparison

Research snapshot: 2026-08-11

These labels are directional: **strong**, **partial**, **weak**, or **none/unknown**. They summarize
the detailed reports; they are not benchmark results. “ZD surface” means the existing DOM/CodeMirror
Markdown experience plus future bespoke goals, todos, and graphs—not generic Markdown support.

## Hosts, workbenches, and companions

| Candidate | ZD surface | Global overlay | Retained projects | Terminal | Browser | Supported extension seam | Best role |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Current Tauri ZD | **Strong** | Partial, bounded work | Weak today | None today | External only | ZD owns it | Primary owning app |
| [bb](bb.md) | Partial, plugin spike needed | None documented | **Strong** | **Strong** | **Strong** desktop | Promising but partly experimental | Most important substrate experiment |
| [Zed](zed.md) | Weak; no custom editor/panel API | None documented | **Strong** | **Strong** | Partial preview | Strong for languages/agents, wrong UI seam | Code and ACP companion |
| [Warp](warp.md) | Weak; no arbitrary pane API | **Strong** | Partial configs; Project is roadmap | **Strong** | Weak | Config/deep-link/MCP, not custom UI | Terminal/agent workbench companion |
| [iTerm2](iterm2.md) | Partial through constrained WebView | **Strong** | **Strong** tabs/arrangements | **Strong** | **Strong** but young | Python/RPC/WebView, not embeddable terminal | Fastest workflow prototype host |
| [Ghostty](ghostty.md) | None | **Strong** | Partial; quick terminal lacks tabs | **Strong** | None | AppleScript/config; no GUI plugins | Terminal companion and future engine |
| [Herdr](herdr.md) | None | Host-dependent | **Strong** terminal workspaces | **Strong** runtime | None | **Strong** CLI/socket; terminal UI only | Persistent terminal/agent runtime |
| [T3 Code](t3-codes.md) | Weak; no ZD editor | None documented | **Strong** agent projects | **Strong** | **Strong** preview | No stable third-party plugin API | Benchmark, trial, architecture reference |
| [Superlogical](superlogical.md) | Unknown | Claimed direction, not proven | Promising | Promising | Unknown | Not public | Watchlist and session-model inspiration |
| [Raycast](raycast.md) | Weak, host components only | **Strong** launcher | Weak | None | Link actions only | **Strong** for short commands | ZD command/capture remote control |
| [Hammerspoon](hammerspoon.md) | None | **Strong** experiment | None | None | None | Local Lua automation | Interaction prototype only |

## What the matrix says

No current host has all three properties that matter simultaneously:

1. the exact ZD document/domain UI;
2. the Mac-global, retained project-session interaction;
3. a mature terminal/browser/agent workbench.

bb is the only candidate close enough to justify a real plugin-fidelity spike. iTerm2 is the fastest
way to prototype the hotkey-plus-numbered-project interaction with mature terminals. Zed, Warp,
Ghostty, and Herdr each remove a hard subsystem as companions, but their supported public APIs do not
make them owners of the ZD product surface.

## Agent engines

| Harness | Provider breadth | Machine interface | Built-in workflow | Permission posture | Lock-in | Best ZD role |
| --- | --- | --- | --- | --- | --- | --- |
| [Hermes](hermes-agent.md) | **Strong** | Gateway RPC, ACP, HTTP, CLI | **Very strong** goals/Kanban/gates | Rich but fast-moving | Workflow/database coupling | Trial as complete replaceable backend |
| [Pi](pi-agent.md) | **Strong** | **Strong** RPC and TypeScript SDK | Deliberately minimal | Full user authority by default; ZD must add policy | Low engine coupling, higher build burden | Best substrate when ZD owns semantics |
| [Claude Code](claude-code.md) | Claude family | Mature SDK and headless stream | **Strong** Claude-native features | Mature configurable approvals | High model/auth/product coupling | Optional supported engine |
| [Codex](codex.md) | OpenAI-shaped, some compatible backends | Deep App Server plus exec/SDK/MCP | **Strong**, goals/plans/events | Rich sandbox/approval model | Moderate; deepest APIs are evolving | First deep-client prototype, pinned adapter |

## Harness conclusion

There should be no universal lowest-common-denominator `Agent` interface yet. The useful shared
boundary is a small host contract—start or attach a session for a project, stream typed events, send
input, answer approval/user questions, stop/detach, and expose capabilities. Provider-specific events
should remain available behind capability checks.

Start with one deep adapter and one deliberately different adapter. Codex App Server plus Pi RPC is
the most informative pair: one exposes a rich client protocol, the other exposes a minimal
multi-provider engine. Hermes should be the next trial if the question becomes “how much workflow can
we buy?” Claude Code remains a valuable optional engine through its supported SDK/headless path.

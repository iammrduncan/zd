# Terminal Goal

## Outcome

`zd` provides fast, bounded native terminal sessions that can run ordinary shells and supported
agent CLIs without crashes, runaway background work, or unbounded memory growth.

## Visual References

- [Approved side-by-side workbench](assets/workbench-light-side-by-side-v2.png) shows the intended
  relationship between an active terminal-backed thread and the selected file.
- [Approved overlap workbench](assets/workbench-light-overlap-v2.png) shows the shell state in which
  selecting a terminal-backed thread replaces the centre file surface instead of adding a third
  persistent region.

These concepts define composition only; terminal rendering, input, accessibility, scrollback, and
process behavior remain governed by this goal. Apply the shared Visual Reference Contract in
`goal.md`.

## Acceptance Criteria

1. A platform spike proves one pseudoterminal session can start, display output, accept input,
   resize, and terminate cleanly on macOS and Windows before the generalized terminal API lands.
2. Native code owns structured terminal session handles, cwd, environment policy, resize, input,
   output, exit status, descendant-process cleanup, and disposal. The frontend does not receive a
   generic arbitrary-command IPC endpoint.
3. A project can own zero or many terminal sessions. Each starts in the selected project or
   thread worktree, remains alive while another project/thread is active, and cannot escape its
   approved filesystem context through application APIs.
4. Terminal rendering supports Unicode, grapheme-safe selection, copy/paste, keyboard input,
   resize/reflow, search, bounded scrollback, and accessible focus without stealing application
   shortcuts.
5. `cmd+j` on macOS and the approved Windows equivalent focus the active terminal/thread region
   through the shared command registry and restore the previous focus target when dismissed.
6. Terminal colours and typography consume the active validated theme. A theme change does not
   restart the process or discard scrollback.
7. Codex, Claude Code, and OpenCode run through their normal CLIs in representative sessions. Exit,
   crash, detach, application close, and forced process termination have explicit cleanup behavior.
8. Agent detection uses a versioned detector contract with `unknown`, `idle`, `busy`, and
   `waiting` results. Detection never treats arbitrary output text as authority without a bounded
   adapter and tests for the supported CLI/version.
9. Scrollback, queued output, detector buffers, and inactive render work have explicit limits.
   Measurements cover idle CPU, output throughput, resize, memory per terminal, and many inactive
   terminals in a release build.
10. Unit, integration, browser, and native tests cover session lifecycle, cwd, resize, Unicode,
    scrollback limits, process-tree cleanup, agent states, shortcuts, theme changes, failures, and
    project isolation.

## Terminal Condition

Multiple project-scoped terminals can run supported agent CLIs for a sustained native session,
switch in and out without loss, report bounded lifecycle/status events, and clean up every process
and buffer they own.

## Dependencies

- Requires the Workbench Reorganization Goal's region, platform, focus, and theme contracts.
- Project association uses the Projects Goal's stable project/worktree context.
- The PTY spike may run in the first foundation fanout; generalized lifecycle must settle before
  Threads and Notifications integrate with it.

## Exclusions

- A remote shell service, container manager, terminal multiplexer protocol, or general process API.
- ACP transport or a first-party agent.
- Persisting raw terminal transcripts by default.

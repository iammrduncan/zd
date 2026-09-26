# Notifications Goal

Status: **complete — 2026-08-22**

## Outcome

When a supported agent thread finishes a turn and needs attention, `zd` can issue one privacy-safe
desktop notification and optional chime that returns the user directly to that thread.

## Acceptance Criteria

1. Notifications consume the Threads Goal's versioned `waiting` attention event. One busy-to-waiting
   transition produces at most one notification, even if output, watchers, or window focus change.
2. A desktop notification identifies `zd`, project, thread, and agent type without exposing prompt,
   terminal, file, or secret content by default.
3. Activating View summons the existing workbench and atomically activates the target project,
   worktree, and thread. Close dismisses only the notification and does not close the thread or
   process.
4. If the project, worktree, thread, or process is unavailable when View is selected, `zd` opens to
   a specific recoverable state rather than choosing a different target silently.
5. Notifications behave deliberately while `zd` is focused: the attention state always updates,
   while desktop presentation and sound follow one documented foreground policy.
6. Notification permission denial, unsupported platform APIs, registration failure, and operating
   system suppression never block thread completion or application use. The Threads region remains
   the in-app source of truth.
7. Chimes are off or on according to one explicit default, can be muted globally, and can be chosen
   per supported thread/agent type. Missing or invalid sound files fall back safely.
8. Sound respects application volume/mute settings and accessibility expectations. Repeated or
   overlapping completion events are rate-limited so they cannot create an audio storm.
9. Notification and sound work remains event-driven with no polling and no measurable idle CPU
   when no attention event occurs.
10. Unit and native tests cover deduplication, foreground/background policy, View/Close routing,
    missing targets, permission denial, unsupported platforms, privacy fields, per-type sound,
    mute, and rate limiting.

## Completion Evidence

- The workbench attention coordinator consumes only the versioned thread busy-to-waiting event,
  preserves the Threads region as source of truth, and deduplicates delivery by stable event ID and
  attention version.
- Native notification requests contain only bounded project/thread/agent labels and opaque routing
  IDs. View summons the existing window and activates the exact thread through the root transaction;
  Close dismisses the native notice without touching product state.
- Persisted desktop and sound controls are opt-in. Foreground suppression, permission denial,
  unsupported platforms, invalid/missing sounds, mute/volume, per-agent choices, and rate limiting
  all degrade without blocking thread lifecycle.
- Current native presentation and sound are implemented for macOS; other platforms report an
  explicit unsupported status while in-app attention remains complete.
- Unit/native suites cover routing, privacy, denial, unsupported states, deduplication, sound policy,
  and rate limits. The release attention fixture delivered 1,000 events in about 3.2 ms with zero
  idle adapter calls and no repeated notification work.

## Terminal Condition

A completed supported-agent turn produces one appropriate attention signal, View restores the exact
thread, Close has no product side effects, and denied or unavailable notification services degrade
without lost state or repeated noise.

## Dependencies

- Requires Threads' stable identity and attention event, Projects' activation path, and the
  workbench global summon/focus command.
- Sound and native notification adapters may be implemented in parallel after the event contract is
  fixed; routing integration follows sequentially.

## Exclusions

- Notifications for arbitrary terminal output, file changes, Git events, or remote services.
- Prompt/response previews, notification history sync, mobile push, or remote delivery.
- Owning thread completion detection; Notifications only presents the event.

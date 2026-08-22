# Instrumentation Goal

## Outcome

Local, opt-in instrumentation gives a person or agent enough structured evidence to diagnose high
CPU, memory growth, slow interactions, crashes, and incorrect state transitions without adding
remote telemetry or meaningful overhead while disabled.

## Acceptance Criteria

1. Instrumentation is off by default. While off, no trace or event-log writer runs, no diagnostic
   file is created, and periodic sampling does not keep the application busy.
2. An explicit setting enables and disables instrumentation without reinstalling the application.
   Disabling it flushes and closes active writers cleanly.
3. An enabled session records a versioned manifest, structured event logs, traces/spans, errors,
   process memory, and CPU samples with monotonic timestamps and stable project/thread/session IDs
   where applicable.
4. Major workbench actions emit bounded evidence: launch, project/thread/file transitions, file and
   Git operations, terminal lifecycle, notifications, command dispatch, long tasks, and failures.
   High-frequency input and terminal bytes are not logged as individual events.
5. Logs live under the platform `zd` config or diagnostic directory, are discoverable through one
   command, and use an agent-readable documented format.
6. Rotation, retention, and total-size limits prevent instrumentation from filling the disk.
   Disk-full, permission, and corrupt-session failures degrade to a visible diagnostic state
   without crashing or blocking product work.
7. Secrets, environment values, terminal contents, document contents, and full user paths are
   excluded or redacted by default. A review covers every event field before it ships.
8. Measured disabled overhead is indistinguishable from the uninstrumented baseline within normal
   run variance. Enabled sampling is bounded and does not violate the idle-CPU goal.
9. Unit and native tests cover default-off behavior, enable/disable, schemas, redaction, rotation,
   write failures, and clean shutdown. A diagnostic fixture proves an agent can reconstruct one
   slow action and one memory-growth interval.

## Terminal Condition

Instrumentation can be turned on for a reproducible diagnostic session, produces bounded and
privacy-safe evidence that an agent can inspect, and returns to zero background work when disabled.

## Dependencies

- Requires the Workbench Reorganization Goal's configuration path, stable IDs, and shared error
  reporting boundary.
- May run in parallel with Projects, Editor, and the terminal PTY spike after those interfaces are
  fixed; feature-specific spans land with their owning feature.

## Exclusions

- Remote telemetry, analytics, crash uploading, accounts, or a hosted observability service.
- Recording raw prompts, terminal transcripts, document contents, secrets, or environment dumps.
- An always-on profiler.

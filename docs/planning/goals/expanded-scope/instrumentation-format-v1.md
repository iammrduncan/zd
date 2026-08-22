# Local diagnostic format v1

Status: implementation contract for the Instrumentation Goal

The `zd` diagnostic format is a small local evidence bundle. It is disabled by default, contains no
remote transport, and cannot accept arbitrary payload fields. An enabled session is one direct
directory under the platform `zd` diagnostic directory:

```text
session-<time>-<process>-<counter>/
├── manifest.json
├── events-00001.ndjson
├── events-00002.ndjson
└── …
```

The workbench integration must expose this directory through one `diagnostics.reveal` command.
Callers do not construct its path or write its files. Disabling diagnostics wakes and joins the
sampler, flushes the active segment, closes the writer, and marks the manifest with
`closedCleanly: true`.

## Limits and lifecycle

The production defaults are deliberately small:

| Limit | Default |
| --- | ---: |
| Process sample interval | 30 seconds |
| One NDJSON segment | 1 MiB |
| One complete session | 10 MiB |
| All retained sessions | 50 MiB |
| Retained sessions | 5 |
| Retention age | 7 days |

The session limit includes the manifest and a close-update reserve. Rotation happens before a record
would cross the segment limit. Retention runs only during explicit enable, before the new session is
created. It removes the oldest regular session directories until both count and total-size limits
leave room for the new session. Symbolic links and nested entries are never followed.

While disabled, the frontend does not construct its transport or read its monotonic clock. Native
state does not create the diagnostic directory, open a file, start a thread, wait on a timer, or call
the process sampler. A writer or sampler failure stops further sampling and becomes the local
`problem` on diagnostic status; it never blocks the product action being observed.

## Manifest

`manifest.json` is a closed, versioned JSON object:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` for this format |
| `format` | `zd-diagnostics` |
| `sessionId` | Opaque identity for this diagnostic run |
| `appVersion` | Bounded package version token |
| `startedAtUnixMs`, `endedAtUnixMs` | Wall-clock discovery metadata only |
| `closedCleanly` | Whether disable or application shutdown flushed the session |
| `monotonicUnit` | `microseconds` |
| `eventFiles` | Numeric NDJSON segment pattern |
| `privacy` | Explicit false claims for raw content, environment values, and full paths |
| `limits` | The segment, session, total-size, and count policy used for this run |

A missing, oversized, malformed, linked, mismatched-version, or identity-mismatched manifest makes
that session corrupt in the catalog. Other sessions and product work remain available.

## Record envelope

Read `events-*.ndjson` in numeric filename order. Every line is one complete JSON object with:

```text
schemaVersion: 1
sessionId: diagnostic session identity
sequence: contiguous session-local integer
monotonicUs: elapsed microseconds since this session writer started
recordType: event | span | error | state | sample
```

The sequence orders records that share a timestamp. `monotonicUs`, not wall time, is used for
durations and intervals.

| Record type | Additional reviewed fields |
| --- | --- |
| `event` | `operation`, `outcome`, optional `context` |
| `span` | `operation`, `traceId`, `spanId`, optional `parentSpanId`, `durationUs`, `outcome`, optional `context` |
| `error` | `operation`, stable `code`, optional `context`; never an exception message |
| `state` | `operation`, bounded `from` and `to` tokens, optional `context` |
| `sample` | finite `cpuPercent` and process `residentBytes` |

`outcome` is one of `ok`, `cancelled`, `refused`, `failed`, or `unavailable`. Strings are bounded
opaque tokens: at most 96 ASCII letters, digits, `.`, `_`, `:`, or `-`, beginning with a letter or
digit. Numbers are finite and bounded. Unknown and missing required fields fail closed.

Feature owners choose their operation names and emission points. Adding an operation does not add a
field: its owning feature test must show that the existing closed record contains enough evidence
without terminal bytes, input events, prompts, document text, environment values, or exception
messages. High-frequency work is represented by one completed span or aggregate event.

## Context and path privacy

Context may include stable opaque `projectId`, `worktreeId`, `threadId`, and `threadSessionId` values.
A path is transformed in the frontend before it crosses native IPC:

```json
{ "scope": "project", "depth": 3, "extension": "md" }
```

Only logical depth, an optional 1–12 character alphanumeric extension, and whether the input was a
safe project-relative path survive. Absolute paths, home-relative paths, traversal, directory names,
and filenames do not. The native deserializer accepts only this already-redacted object. There is no
generic details map, text message, attachment, raw error, environment, prompt, document, or terminal
field.

## Agent reconstruction procedure

1. Validate the manifest version, format, identity, limits, and clean-close state.
2. Read numeric segments in order and require one session identity, schema version, contiguous
   sequence, and nondecreasing monotonic time.
3. Locate spans or errors by reviewed `operation`, then correlate nearby state/event records by
   stable IDs and trace IDs.
4. Compare bounded samples by monotonic interval to identify resident-memory growth and CPU changes.
5. Treat gaps, an unclean manifest, or a per-session `problem` as evidence rather than inventing
   missing events.

The checked-in
[`slow-and-growing` fixture](../../../../packages/app/tests/fixtures/instrumentation/v1/slow-and-growing)
contains a 240 ms `file.open` span and two samples 30 seconds apart with 32 MiB resident-memory
growth. Its unit test reconstructs both facts and scans the bundle for forbidden content fields and
full-path shapes.

## Integration boundary

The native integration owner registers one `DiagnosticService` created with the platform diagnostic
directory, package version, default policy, and an injected cross-platform `ProcessSampler`. The
shared platform facade maps these commands without widening their inputs:

```text
diagnostics_status() -> DiagnosticStatus
enable_diagnostics() -> DiagnosticStatus
disable_diagnostics() -> DiagnosticStatus
record_diagnostic(record: DiagnosticRecordInput) -> DiagnosticWriteOutcome
reveal_diagnostics() -> void
```

The application shutdown hook calls `disable`; `DiagnosticService::drop` is a second clean-shutdown
guard. The operating-system sampler supplies only CPU percentage and current resident bytes. It does
not enumerate processes, arguments, environment, files, or terminal state.

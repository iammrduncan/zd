# 0003: Confirm writes before marking a document clean

## Status

Accepted

## Context

The removed source audit found that the editor marked a buffer clean before an asynchronous write
completed. A refused write or filesystem error could therefore report unsaved work as saved.

Two quick save commands could also overlap their stamp checks and writes. That race could produce a
false external-change warning.

## Decision

We will mark a document clean only after its save handler confirms the write.

The editor will keep its saved snapshot unchanged when the handler returns `false` or rejects. The
owner of the file path will report the failure and keep the buffer available.

The editor will serialize save attempts through one promise chain. A later save will start after
the earlier attempt settles.

The native backend will write a sibling temporary file, flush it, and rename it over the target.

## Consequences

- Dirty state remains truthful after a refused or failed write.
- Rapid save commands cannot reorder writes or file-stamp updates.
- The path owner must explain filesystem failures because the editor does not know the path.
- A queued save can write a newer editor snapshot after an earlier attempt completes.
- Atomic replacement can affect hard links and file watchers. The safety of document contents takes
  priority.

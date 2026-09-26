# 0003: Scope file access to the launch workspace

## Status

Superseded by
[0006: Scope file access to approved project grants](0006-scope-file-access-to-approved-project-grants_H.md)

## Context

The removed source audit found that file commands accepted any absolute path from the webview. A
webview compromise could therefore read or replace any file available to the user account.

A launch request already identifies one document or workspace. That request can define a smaller
file-authority boundary.

macOS can send a Finder open request to a running application. The app must not change file
authority while an unsaved document still needs its current folder.

## Decision

We will derive file authority from the native launch request. A launched folder scopes access to
itself. A launched document scopes access to its parent folder.

The Rust backend will canonicalize paths and refuse files outside that scope. It will also refuse
`..` and symbolic-link escapes. No file command will succeed when no scope exists.

The frontend cannot widen the scope by naming a path.

A Finder request will remain pending until the current document accepts the switch. Native state
will change the launch request and file scope together under one lock.

## Consequences

- A compromised webview has a smaller file-access blast radius.
- A workspace can open sibling Markdown files without requesting new authority.
- New files can be created inside the scope after the backend validates their parent folder.
- The app must queue native open requests while unsaved work blocks a switch.
- Features that need files outside the workspace require an explicit new authority design.

## Revision history

- `5699c1e33b88eb0e6d34a8303e71b33e90f99bdf` — Prior accepted version before the multi-project grant decision.

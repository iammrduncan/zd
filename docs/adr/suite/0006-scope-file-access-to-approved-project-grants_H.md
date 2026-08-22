# 0006: Scope file access to approved project grants

## Status

Accepted

Supersedes
[0003: Scope file access to the launch workspace](0003-scope-file-access-to-launch-workspace_H.md).

## Context

The launch-workspace boundary limited a compromised webview to one folder, but one workbench must
retain several user-approved projects and Git worktrees at once. Replacing the one active scope with
an unrestricted list of frontend paths would remove the security property that made the original
boundary useful.

CLI, file-association, native picker, and worktree operations can introduce roots. Ordinary frontend
file, Git, editor, and terminal requests only need to refer to roots the native side already approved.

## Decision

Native code will own a set of project grants keyed by stable opaque project IDs. Each grant contains
one canonical project root and an explicit set of approved worktree roots.

A grant can be created only from a native launch/open event, an operating-system folder picker, or a
structured native Git worktree operation. The frontend may activate, use, or request removal of an
existing grant by ID. It cannot create or widen a grant by supplying an arbitrary path.

Every file and Git operation will carry a project ID plus a project-relative path or another typed
resource reference. Native code will canonicalize the target and reject parent traversal, symbolic
link escape, cross-grant access, and use of a removed or unavailable grant.

Inactive grants remain valid so dirty buffers and terminal sessions can survive project switching.
Grant removal is explicit and occurs only after the workbench confirms that no dirty document,
running process, or required worktree still depends on it.

CLI and file-open requests will resolve or create a grant natively, then enter the same transactional
workbench activation path as in-app navigation.

## Consequences

- One webview compromise is limited to the projects and worktrees the person approved.
- Multi-project switching no longer requires moving or revoking the only filesystem scope.
- Frontend APIs become resource-oriented instead of accepting absolute paths.
- Grant persistence and unavailable-root recovery need versioned native state and tests.
- Removing a project becomes a coordinated lifecycle operation rather than deleting one map entry.
- Remote projects or arbitrary terminal cwd values require a separate authority decision.

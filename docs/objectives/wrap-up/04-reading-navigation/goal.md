# Goal 04: Complete reading navigation

## Outcome

A reader always knows where they are, can find content and workspace documents, follows supported
links through explicit trust boundaries, and can retrace navigation without losing the document
surface.

## Source todos

- **WU-001:** Show reading progress and remaining distance.
- **WU-002:** Activate rendered links on the editor surface.
- **WU-020:** Navigate relative workspace links in the document window.
- **WU-021:** Send only genuine HTTP links to the approved external destination.
- **WU-022:** Add back and forward history for document navigation.
- **WU-034:** Add a keyboard-reachable document outline.
- **WU-035:** Add find-in-document.
- **WU-043:** Resolve and bound the proposed external-link browser miniapp.

## Acceptance criteria

1. A small bottom-right reading indicator reports progress through the current document and the
   remaining distance without reserving permanent document width or competing with prose.
2. Activating a rendered link uses the settled link gesture and does not expose raw webview
   navigation. Ordinary caret placement and editing remain available through the documented
   interaction.
3. Relative links resolve against the current document, remain inside native workspace scope, open
   supported local text documents on the same surface, and report refused or missing targets
   without destroying the current buffer.
4. Only validated HTTP and HTTPS destinations cross the local-document boundary. Relative, file,
   script, data, and malformed destinations never reach an external opener.
5. A human resolves whether accepted HTTP destinations use the system browser or a deliberately
   narrow suite browser miniapp. If a miniapp is chosen, its navigation, process, permission, and
   data boundaries are documented before implementation; a general browser is not implied.
6. Back and forward restore document, selection/focus position, and scroll context across local
   navigation without weakening workspace scope.
7. Outline is keyboard reachable, reflects heading hierarchy, and navigates on selection. Find is
   keyboard reachable, reports result position/count, and moves through matches without replacing
   editor state.
8. Browser and native tests cover relative links, rejected protocols, the approved HTTP handoff,
   history, outline, find, and progress behavior.

## Terminal condition

All eight source todos are closed, the external-destination decision is recorded, and a user can
follow a local link, search or outline-jump, move back and forward, and activate one approved HTTP
link without leaving an unsafe or unreturnable state.

## Dependencies

- Link activation follows the local-navigation and external-handoff implementations; wiring a
  gesture to an absent destination does not satisfy the goal.
- Workspace lookup and file authority reuse Goal 03 and the accepted file-scope ADR.

## Exclusions

- Remote document sync or opening arbitrary local files outside workspace scope.
- A general-purpose web browser with tabs, downloads, credentials, extensions, or arbitrary
  protocols.
- Editing the file tree or application settings.

after finishing this goal write a goal-summary.md in this folder explaining how you completed the goal.

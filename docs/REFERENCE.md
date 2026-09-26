# v1.0.1 prototype reference

Use this page to look up the current command surface, stored files, limits, and known constraints.

## Launch

| Command | Result |
| --- | --- |
| `zd` | Open the current directory |
| `zd PATH` | Open a project directory or a file with its parent as the project |
| `zd --help` | Print launch and key help without entering terminal mode |
| `zd --version` | Print `zd 1.0.1` |

Paths must already exist. A file must be valid UTF-8, contain no NUL byte, and fit the document size
limit before it can open for editing.

## Keyboard

| Key | Action |
| --- | --- |
| `Tab` | Switch focus between sidebar and document |
| `Up`, `Down` | Move the sidebar cursor or document caret by logical line |
| `Left`, `Right` | Move by grapheme; hold `Shift` to extend selection |
| `Home`, `End` | Move to the start or end of the document |
| `Enter` | Open/toggle the selected sidebar entry, insert a newline, or confirm an overlay |
| `Backspace` | Delete the selection or previous grapheme |
| `Esc` | Cancel a prompt/handoff or leave search results |
| `Ctrl-B` | Hide or show the sidebar |
| `Ctrl-P` | Search text across eligible project files |
| `Ctrl-F` | Find literal text in the active file |
| `Ctrl-E` | Replace all literal matches in the active file |
| `Ctrl-S` | Save the active file atomically |
| `Ctrl-Z`, `Ctrl-Y` | Undo or redo one semantic edit |
| `Ctrl-R` | Switch Markdown between Edit and Read mode |
| `Ctrl-N` | Add a comment to the exact active selection |
| `Ctrl-L` | Show comments for the active file |
| `Ctrl-G` | Prepare a selection handoff, choose an agent, preview, then explicitly submit |
| `Ctrl-U` | Read a local RGBA clipboard image and insert a Markdown link |
| `Ctrl-Q` | Quit and restore terminal state |

Typing edits only in Edit mode. Bracketed text paste is one edit; while a prompt is open it fills the
prompt, and while handoff confirmation is open it is ignored.

## Mouse

| Gesture | Action |
| --- | --- |
| Click a file | Open it |
| Click a directory | Expand or collapse it |
| Click Edit text | Place the caret at the mapped UTF-8/grapheme boundary |
| Drag Edit text | Extend the document selection across terminal cells |
| Click Read text | Select the parser-declared exact or whole-node source span |

Synthetic Read-mode markers are not selectable. A cell inside a wide grapheme maps to that
grapheme's first source byte.

## Review storage

Comments are stored in `<project>/.zd/review-v1.json`. Each record contains a project-relative path,
source hash, half-open UTF-8 byte range, exact selected text, bounded prefix/suffix context, comment,
and ID. `.zd` and the sidecar must not be symbolic links.

Re-anchoring checks, in order: same revision and range, unchanged exact range, unique contextual
match, then unique exact match. Missing or ambiguous matches are `detached`.

## Agent handoff

Herdr integration executes `herdr agent list`, parses structured output, and later executes
`herdr agent prompt TARGET TEXT` with separate arguments. Source text never enters a shell command.

The overlay sequence is target selection → payload preview → explicit submit. `Esc` cancels. Missing
Herdr or no targets leaves a bounded prepared prompt for manual delivery. `zd` does not start, stop,
attach to, or infer the lifecycle of an agent session.

## Clipboard images

`Ctrl-U` is an explicit image command; ordinary paste remains text. The active document must be
editable Markdown. A valid local RGBA image is encoded as PNG and installed beside the document:

```text
document-directory/
├── notes.md
└── zd-images/
    └── image-<full-blake3-hash>.png
```

The inserted Markdown image uses the entered alt text and the relative
`zd-images/image-<hash>.png` path. Identical PNG bytes reuse the same file. A symlinked directory,
mismatched collision, invalid image, write failure, remote/headless clipboard, or document edit
failure does not modify the document. Undo removes the link, not the content-addressed image file.

## Bounds

| Item | Limit |
| --- | ---: |
| Editable document | 10 MiB |
| Undo history | 256 edits |
| Visible tree entries | 50,000 |
| Project-search matches | 10,000 |
| Prompt input | 32 KiB |
| Review sidecar | 1 MiB |
| Review comments | 1,000 |
| One comment | 16 KiB |
| Stored exact review selection | 64 KiB |
| Review prefix/suffix | 128 bytes each |
| Prepared handoff | 32 KiB |
| Herdr discovery output | 1 MiB / 128 targets |
| Clipboard image dimension | 4,096 × 4,096 maximum |
| Decoded clipboard pixels | 32 MiB |
| Encoded PNG | 16 MiB |

Reaching a tree or search cap is represented by the core result. Unsupported, binary, invalid-UTF-8,
and oversize files can appear in the tree but do not open or participate in text search.

## Current limitations

- One active document; no tabs, splits, file creation/rename/delete, or file watcher.
- No syntax highlighting, LSP, completion, diagnostics, refactoring, or configurable keymap.
- Search and replace are literal in the TUI; the document core also has tested regex operations.
- Read mode displays image alt/path text. It does not fetch remote images or use terminal graphics.
- Clipboard images require a same-host graphical session supported by Arboard. The Podman helper,
  SSH-only sessions, and unsupported Wayland compositors report the capability as unavailable.
- Herdr 0.9.1 is the only automatic agent adapter. Other multiplexers use the manual prompt fallback.
- Ghostty behavior is not claimed until the [owner checklist](acceptance/GHOSTTY-HERDR.md) is run.

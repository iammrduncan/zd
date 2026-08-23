# ZenSuite `zd` design system

Status: **canonical and binding**

Applies to: the complete `zd` workbench

Date: 2026-08-21

This document supersedes the ZenSuite miniapp design contract. It preserves the established editor
typography and interaction character while defining the project, thread, terminal, file, Git,
notification, theme, and quick-access surfaces of one workbench.

## 1. Authority

When current documents disagree, use this order:

1. Human direction defines owner intent.
2. [VISION.md](VISION.md) defines product behavior and scope.
3. Accepted [architecture decisions](adr/README.md) define implementation boundaries.
4. This document defines visual and interaction behavior.
5. The active [expanded-scope execution plan](planning/goals/expanded-scope/goal.md) sequences work
   without overriding product or architecture authority.
6. [User documentation](user-facing-docs/README.md) describes behavior that has shipped.
7. Source code and tests show what the current implementation can prove.

Research, ideas, historical objectives, and superseded records preserve context. They do not direct
new implementation.

## 2. Naming and product character

ZenSuite is the product-family and repository identity. The application, workbench, and command are
named `zd`. The name is complete and is not expanded in product copy.

`zd` is a quiet place to understand and steer agent-assisted work. It should feel:

- calm, not empty;
- capable, not busy;
- warm, not tinted for effect;
- precise, not technical-looking for its own sake;
- fast enough that the interface appears to anticipate the person; and
- consistent enough that every region feels like one application.

The visual references are the existing `zd` editor, iA Writer, OmmWriter, and the approved light
workbench concepts linked from the execution plan. They are influences and evidence, not skins to
copy pixel for pixel.

## 3. Non-negotiable principles

### Content remains the interface

The selected file or thread is the primary surface. Navigation earns persistent space only because
project and agent context must remain visible together. A region does not add a toolbar merely to
advertise its available commands.

### Text before controls

Actions are words. Selection uses type, alignment, colour, a quiet wash, or a hairline. There are no
boxed buttons, pills, floating action buttons, decorative cards, ornamental badges, or icon grids.
File-type and thread-type icons are compact content labels, not buttons.

Text actions retain generous invisible hit areas, accessible names, and complete keyboard behavior.

### Chrome stays quiet

The native traffic-light or caption controls may remain where the operating system requires them.
The application reserves one blank, hairline-separated top drag strip when the web surface needs a
reliable native grab area. It draws no title text, branded header, persistent status bar, footer,
decorative scrollbar, breadcrumb strip, minimap, or control ribbon.

Files/Changes is one sanctioned text-tab pair. It uses words and a hairline, not boxed tabs.

### Hierarchy comes from type and geometry

Use scale, weight, spacing, indentation, alignment, colour, and hairlines. Do not use shadows,
gradients, glass, textures, floating cards, or large tinted containers to manufacture hierarchy.

### State has one owner

Changing project, worktree, thread, file, theme, region mode, Git revision, or quick-access state
must not make unrelated content jump or briefly show mixed context. Views request transitions from
the workbench owner and render the resulting snapshot.

The owner exposes one source-neutral context activation boundary with exact, project, thread, and
file intents. A click, keyboard shortcut, completion notification, or restored session maps to one
of those intents; the input source does not create different state semantics. The owner resolves the
remembered project/worktree/thread/file tuple, validates its ownership, runs transition guards, and
publishes the complete context once.

### Local-first is behavioral

There are no cloud badges, account avatars, telemetry prompts, or ambient sync states. Remote image
fetching is blocked. Agent-generated markup is untrusted. Native grants, terminal processes,
notifications, and diagnostics are specific and inspectable.

## 4. One shared design system

The workbench resolves one `DesignSystem` for each frame. The shell, editor, Threads, Files/Changes,
terminal, diffs, transients, settings, and notifications consume semantic roles from that value.
No feature creates a private palette, font scale, spacing system, or theme-name conditional.

```text
Settings + validated theme file
              │
              ▼
      DesignSystem::resolve
      ├── semantic colours
      ├── typography roles
      ├── spacing and measure
      ├── focus and selection
      ├── terminal and diff roles
      └── motion/accessibility policy
              │
              ▼
       every workbench region
```

Rendering code uses roles such as `surface.canvas`, `text.secondary`, and `state.changed`. Literal
visual values live only in shared theme/style definitions. A measurement derived from content,
viewport, font metrics, or operating-system scale is not a visual literal.

## 5. Theme files

Installable themes are validated data, never executable plugins. Each file is named
`<name>.theme.config` under the platform `zd` configuration directory.

The initial schema is versioned and closed:

```text
ThemeConfigV1
├── schemaVersion: 1
├── name
├── appearance: light | dark
├── colours: every required semantic colour role
└── syntax: keyword | type | function | string | number | comment | punctuation
```

Validation rejects:

- unknown schema versions;
- missing or additional keys;
- invalid colours or non-finite values;
- unreadable required foreground/background pairs;
- unsafe paths, URLs, imports, scripts, commands, or executable content; and
- files larger than the documented configuration limit.

The configuration limit is **65,536 bytes (64 KiB) per file**. Discovery reads only regular,
direct-child `*.theme.config` files; symbolic links and nested paths are rejected.

One invalid theme produces one specific local notice and falls back to the last valid theme or the
current light theme. It never prevents launch. A theme change updates every open region without
restarting processes, clearing editor history, or moving the semantic viewport anchor.

The application ships three built-ins through this same loader:

1. **Current Light**, the established warm `zd` editor treatment;
2. **Dark**, the same hierarchy on a near-charcoal plane; and
3. **Dracula**, a purple-charcoal palette with restrained Dracula syntax colours.

System appearance resolves to Current Light or Dark. An explicit choice ignores later operating
system changes. Warmth remains a separate manual preference and applies to every resolved colour.

## 6. Semantic colour roles

### Core palettes

| Role | Current Light | Dark | Dracula |
| --- | --- | --- | --- |
| `surface.canvas` | `#FAFAF7` | `#191A19` | `#282A36` |
| `surface.sidebar` | `#F3F3EF` | `#20211F` | `#21222C` |
| `surface.transient` | `#F7F7F3` | `#222320` | `#30323F` |
| `surface.selection` | `#E7E8E2` | `#30322E` | `#44475A` |
| `surface.code` | `#F0F1EC` | `#242622` | `#22232E` |
| `surface.diff-added` | `#E7EFE5` | `#26352A` | `#31443A` |
| `surface.diff-deleted` | `#F2E7E5` | `#382827` | `#493039` |
| `text.primary` | `#242522` | `#E5E2D9` | `#F8F8F2` |
| `text.secondary` | `#5F625C` | `#B4B1A9` | `#C5C8D6` |
| `text.muted` | `#4A4E48` | `#B4B5AE` | `#8B8FA3` |
| `text.link` | `#284C5B` | `#A8CCD8` | `#8BE9FD` |
| `line.quiet` | `#DCDDD7` | `#353733` | `#44475A` |
| `line.focus` | `#506F78` | `#86A9B2` | `#8BE9FD` |
| `state.added` | `#2D5338` | `#A6CFB1` | `#50FA7B` |
| `state.changed` | `#85682C` | `#D1B36C` | `#F1FA8C` |
| `state.deleted` | `#8A4D4A` | `#D99993` | `#FF5555` |
| `state.ignored` | `#9B9D97` | `#777A73` | `#6272A4` |
| `state.error` | `#854943` | `#DB938B` | `#FF5555` |
| `state.waiting` | `#506F78` | `#86A9B2` | `#8BE9FD` |
| `state.busy` | `#A66A18` | `#D7A252` | `#FFB86C` |
| `state.idle` | `#9B9D97` | `#777A73` | `#6272A4` |

These values are theme inputs. The renderer measures final output after warmth and Focus derivation.
Body content must remain within the contrast policy. Interactive text, focus, and status meet WCAG
2.2 AA. Pure black on pure white and pure white on pure black are forbidden.

### Git and lifecycle state

The Files tree uses filename and file-icon colour for compact visible Git state. It does not add a
right-aligned `A`, `M`, `D`, or ignored-status column. Every row exposes the complete state in its
accessible name and description. Deleted and missing states remain distinguishable in Changes and
in contextual text when selected.

Thread rows pair a small state dot with visible lifecycle text such as `busy`, `waiting`, or `idle`.
Colour is supplementary.

### Warmth

Warmth is a colour-space transform over resolved semantic colours and local images, not a translucent
orange overlay. Neutral is an exact identity operation. The warmest setting preserves semantic
contrast, Git distinctions, syntax distinctions, and terminal readability.

## 7. Typography

Typography carries nearly the whole interface.

### Families

The workbench bundles four unmodified local faces:

- `iAWriterQuattroV.ttf` for upright prose and interface text;
- `iAWriterQuattroV-Italic.ttf` for drawn emphasis;
- `iAWriterQuattroS-Bold.ttf` for headings and selected values; and
- `iAWriterMonoS-Regular.ttf` for navigation, paths, Markdown markers, code, terminal text, and
  diffs.

Fonts are never fetched. Synthetic bold, synthetic italic, faux oblique, and stroke expansion are
forbidden. Missing glyphs use the platform fallback chain while preserving the owning role's size,
line height, weight, style, and semantic colour.

### Roles

All values are logical pixels at 1× before operating-system scaling.

| Role | Family | Size / line | Weight | Use |
| --- | --- | ---: | ---: | --- |
| `type.prose` | Quattro | 17 / 28 | Regular | Markdown prose |
| `type.prose-emphasis` | Quattro | 17 / 28 | Italic | Emphasis and quotations |
| `type.h1` | Quattro | 30 / 38 | Bold | Document title |
| `type.h2` | Quattro | 24 / 32 | Bold | Major section |
| `type.h3` | Quattro | 22 / 31.9 | Bold | Subsection |
| `type.h4` | Quattro | 20 / 29.5 | Bold | Fourth level |
| `type.h5` | Quattro | 18 / 27.5 | Bold | Fifth level |
| `type.h6` | Quattro | 16 / 25.4 | Bold | Sixth level |
| `type.code` | Mono | 14 / 22 | Regular | Code files, fenced code, terminal, diff |
| `type.inline-code` | Mono | 15 / 24 | Regular | Inline source |
| `type.navigation` | Mono | 12.5 / 19 | Regular | Projects, threads, files, paths, Git |
| `type.supporting` | Quattro | 13 / 20 | Regular | Notices and quiet metadata |
| `type.action` | Quattro | 15 / 24 | Regular | Text actions and settings values |

The prose size is adjustable from 14 to 28 px. Code size is independently adjustable from 12 to
24 px. Heading scale is one multiplier from 85% to 125%. Navigation density does not scale below its
accessible minimum; it grows when the operating system text scale requires it.

### Measure and rhythm

- Prose measure: 60–75 characters, target 66.
- Reading column: target 560 px, minimum 480 px, maximum 640 px at default size.
- Wide content inset: 64 px; compact inset: 40 px.
- Wide top inset: 80 px; compact top inset: 48 px.
- Paragraph gap: 18 px.
- Opening H1 to content: 28 px.
- Later H1 above/below: 44 / 28 px.
- H2 above/below: 44 / 18 px.
- List item gap: 6 px.
- Quote and code-block margin: 24 px.

Adjacent semantic margins collapse to the larger value. Line length wins over maximizing visible
content. Side by side narrows the reading measure only to its minimum before changing presentation.

## 8. Window and quick access

One process owns one root workbench window. Native content may extend behind the operating-system
titlebar where supported; the web surface begins below its one blank drag strip. The application
paints no title text or substitute caption.

Ordinary window behavior:

- remains visible when another application receives focus;
- participates in normal Dock, taskbar, Mission Control, and window switching;
- restores its last usable size and position; and
- never treats hide/minimize as close.

Quick-access behavior reuses that window and state:

- native global shortcut: `Cmd+Shift+Space` on macOS, `Ctrl+Shift+Space` on Windows;
- appears on the active display and current Space;
- records the previous foreground application where the platform permits it;
- becomes key and restores the last meaningful workbench focus target;
- hides on repeated summon, Escape, or focus loss;
- returns focus to the prior application where possible; and
- never prompts for dirty work or tears down a process merely because it hides.

Shortcut registration conflict produces one local, actionable notice. Ordinary launch remains
available. Platform-specific panel mechanics stay below the shared window contract.

## 9. Workbench composition

### Persistent regions

| Region | Side | Default | Minimum | Maximum |
| --- | --- | ---: | ---: | ---: |
| Threads | left | 236 px | 184 px | 300 px |
| Current content | centre | remaining | 528 px | viewport |
| Files/Changes | right | 280 px | 220 px | 360 px |

Hairline dividers use `line.quiet`. Resizing a navigation region preserves its width per workbench
window. There are no visible resize handles; the divider itself has an accessible drag target.

Threads always belongs on the left and Files/Changes always belongs on the right in the shipped
profile. The settings surface may hide or collapse them but does not swap their meanings.

### Centre presentation

Overlap is the default. The selected file or selected thread owns the full centre region.

Side by side shows the active thread on the left of the centre and selected file on the right. One
quiet divider separates them. The default split is 42/58 and is resizable. Each side preserves its
own focus and semantic viewport anchor.

`Cmd+J` / `Ctrl+J` switches centre focus between the current thread and selected file. It uses the
complete context restored for the active project, so switching projects does not discard either
surface.

Side by side is available only when both centre surfaces can retain a useful minimum. When the
window becomes too narrow, presentation temporarily falls back to overlap without changing the
persisted preference. Widening restores the split.

### Responsive order

Compact geometry is applied before suppressing a region.

1. Reduce content insets and navigation widths to their minima.
2. If the centre still cannot remain useful, replace side by side with overlap.
3. Suppress Files/Changes; its command opens the same region as a temporary replacement plane.
4. Collapse Threads to labelled type/status icons.
5. Hide Threads only below the width that can support its collapsed form plus the centre minimum.

Suppression never changes persisted visibility, selection, expansion, filter, scroll, or focus
restoration. A hidden region cannot retain keyboard focus.

## 10. Threads region

Threads is a project/thread hierarchy, not a dashboard.

- Region heading: `PROJECTS` in quiet navigation text.
- The heading and quiet `Open` project action share one header row; neither becomes a separate
  hierarchy level.
- Project rows use a small disclosure chevron, slightly stronger text, and a persistent
  selection-derived background band. The active project strengthens to `surface.selection` and
  keeps the inset `line.focus` hairline.
- Thread rows are indented beneath their project and use compact two-line rows: the name first,
  then terminal/agent type, visible lifecycle, and differing worktree in supporting text.
- The selected row uses `surface.selection`, primary text, and a 2 px inset `line.focus` hairline.
- Hover uses a reduced selection wash and never changes metrics.
- Project and thread order is stable while status updates arrive.

Full-width mode shows complete labels. Collapsed mode shows labelled terminal/agent icons with state
dots and accessible names; hover or keyboard focus reveals the text label without expanding the
whole region. Hidden mode removes the region from layout. All three states are keyboard-operable and
restore selection.

The trailing chevron in the `PROJECTS` header switches full-width and collapsed mode. Collapsed mode
is a 56 px rail of project monograms and thread icons; expanding restores the prior full width. This
presentation change preserves project/thread selection, scroll, active context, and live sessions.

Create, rename, reorder, close, and remove are commands. Their ordinary path is the command list or
contextual text action, not a persistent button strip.

Starting, empty, missing, exited, failed, and unavailable states are plain rows in place. A waiting
thread is quiet but unmistakable; it does not pulse, bounce, or animate.

## 11. Files/Changes region

### Tab pair

`FILES` and `CHANGES` are uppercase navigation text at the top of one right-side plane. Selection is
shown with primary text and a 2 px `line.focus` underline. The inactive word uses secondary text.
The tab change is immediate and preserves independent state.

### Files tree

The tree is deliberately dense, in the manner of Zed:

- 19 px default rows;
- 10–12 px nesting increments;
- approximately 11 px file-type icons;
- small directory disclosure chevrons;
- minimal horizontal padding between disclosure, icon, and name;
- directories first, then files, case-insensitive alphabetical order;
- extensions preserved; and
- long paths scroll horizontally rather than increasing row height.

Expanded directories may show subtle nesting guides using `line.quiet`. The selected file uses the
same wash and inset hairline as Threads. Keyboard focus adds a high-contrast underline or hairline
without changing geometry.

Git colour applies to both filename and icon:

- added/untracked: `state.added`;
- modified/renamed/conflicted: `state.changed`;
- deleted: `state.deleted`; and
- ignored: `state.ignored` with de-emphasized text.

No visible status-letter column, count badge, or Git toolbar is added. The complete state appears in
the row's accessible name and contextual description. A selected conflicted/deleted item also states
its condition in the content surface.

Filter is a focused text row that appears only when summoned. It narrows the current hierarchy by
name, path, or supported category and states result count quietly. Clearing restores the existing
expansion, selection, and scroll. It is not workspace content search.

Loading, empty, denied, missing, non-directory, watcher failure, and non-repository conditions are
honest text rows. Updates never collapse unrelated directories or move the active file.

### Changes

Changes shows, in order:

1. working-tree changes;
2. progressively loaded commit history; and
3. the currently selected comparison inputs.

Outside a Git repository it shows one quiet unavailable sentence. It does not show disabled staging
or commit controls.

A selected change opens a read-only diff in the content region. Wide layouts use Before/After
columns; compact layouts use one inline diff. Deleted spans use a restrained
`surface.diff-deleted` wash, additions use `surface.diff-added`, and unchanged context stays on the
normal canvas. The diff has no minimap, diagnostic gutter, or persistent line-number rail.

Revision identity, source commit, and read-only state are exposed in supporting text and accessible
metadata. Diff navigation never marks the live file dirty.

## 12. Editor surface

### Shared surface

Markdown and code use one CodeMirror owner and one uninterrupted `surface.canvas`. A file does not
sit on a card and does not receive a tab strip, breadcrumb, or editor toolbar.

The editor opens without a caret. First pointer or keyboard intent places one. Selection, caret,
undo, save truth, Find, Focus, and viewport restoration derive from one document state.

Unsaved editable text is kept as a recoverable draft under the approved project, worktree, and
relative-file identity. A file, thread, or project switch is never refused solely because the
current file is dirty. Returning to the file, including after relaunch, restores the draft against
its disk baseline; a successful save clears it. The Files row uses a real bold face and the word
`unsaved` in its accessible name while a draft exists. This recovery state does not introduce tabs.

### Markdown

Markdown is rendered prose, selectable, and directly editable.

- Semantic headings, lists, quotes, code, tables, links, rules, and images retain the existing
  readerly typography.
- Short source notation remains visible: heading, list, quote, emphasis, and inline-code markers.
- Rendered constructs hide long delimiters and destinations. Raw Mode reveals literal source for
  the whole document without creating another editor.
- Block notation hangs left of its text edge so prose keeps one straight measure.
- Raw HTML is inert text. Remote images are never fetched. Unsafe links never activate.
- Fenced code uses one continuous `surface.code` plane and the shared code role.
- Relative local-document links stay in the workbench and preserve reversible history.
- Review annotations remain document-local and cannot become a competing state owner.

Incomplete syntax stays editable plain text. The surface never reveals notation only because the
caret approaches it.

### Code and plain text

Non-Markdown text opens at line one at the top of a full-width code plane. It uses `type.code`, a
compact line-number gutter, all seven syntax roles from the active theme, the shared wrap preference,
selection, caret, undo/redo, scrolling, and saving. Unsupported text stays plain but retains line
numbers. There are no language servers, autocomplete lists, diagnostics, refactoring controls,
debugger, breadcrumbs, folding gutter, or minimap.

Read-only, binary, undecodable, missing, denied, or over-limit content remains scrollable where safe
and explains the restriction in one local supporting line.

### Clipboard images

Editable Markdown and plain-text buffers accept PNG, JPEG, GIF, and WebP clipboard images up to 16
MiB. The webview supplies only the active project/worktree identities, declared media type, and
bytes. Native code validates the signature, chooses a collision-safe filename, and writes only
below the approved worktree's fixed `docs/screenshots` directory; the webview cannot choose a path,
directory, or filename.

The editor keeps the paste selection pending while that bounded write runs. Success inserts one
undoable document-relative image link labelled `Screenshot`. Failure shows a local warning and does
not alter the buffer. File switching and window close are refused while the write is pending, and an
intervening edit is preserved rather than overwritten by the eventual link. Code and read-only
buffers do not intercept image paste.

### Focus and typewriter behavior

Focus Mode is off by default. Enabling it restores the existing line, paragraph, or section
granularity. Target content renders normally; context moves toward its canvas using the configured
dim level without changing layout, source, weight, selection, or caret.

The reading anchor sits roughly one-third down the visible editor. Before a caret, deliberate
reading navigation may move the target. After a caret, scrolling for context does not move it.

A paragraph followed immediately by a code block is one paragraph target. Line focus uses
CodeMirror's actual visual rows, not character-count estimates.

Typewriter Mode requires one active editor column and a caret. It pins that visual line to the
vertical midpoint while typing or moving the caret. It suspends in side-by-side layouts that cannot
maintain the required geometry and resumes when valid.

### Find and Replace

`Cmd+F` / `Ctrl+F` opens a quiet current-file Find surface within the editor bounds without moving
the semantic viewport anchor. It contains:

- one query field;
- result position/count;
- next and previous;
- case, whole-word, and regular-expression text choices; and
- Replace next / Replace all when the active buffer is writable.

Controls are text, not pills or icon buttons. Escape dismisses Find and restores prior focus. Replace
operations are one undoable editor transaction. Invalid regular expressions produce one inline error
and do not run.

Rendered Markdown matches correspond to real source ranges. Hidden source is not claimed as a
visible match unless Raw Mode exposes it.

## 13. Terminal/thread content

A terminal-backed thread renders on `surface.canvas` with `type.code`. It is a content surface, not
a bottom drawer.

At the upper content inset, small supporting text may identify thread name, project/worktree, and
lifecycle. It does not become a boxed terminal titlebar.

Terminal requirements:

- active theme supplies canvas, foreground, ANSI mapping, selection, cursor, and search colours;
- Unicode and grapheme clusters render and select correctly;
- scrollback is bounded and older rows are released deterministically;
- resize reflows without losing the active prompt or selection;
- copy/paste and search remain keyboard accessible;
- application shortcuts win only when registered and available; and
- changing theme or region mode never restarts the process.

The surface does not add chat bubbles, avatars, timestamps, typing indicators, decorative prompts,
or fake agent prose. Output is the terminal's output. Thread metadata stays outside the transcript.

## 14. Transient surfaces and commands

Command List, Settings, Quick Open, Outline, Find, Shortcut Reference, and confirmations are
transient. Exactly one ordinary transient is active at a time. A safety confirmation can displace an
ordinary transient and cannot itself be displaced.

A transient uses one calm `surface.transient` replacement plane. It does not float as a rounded card,
cast a shadow, blur the background, or expose fragments around its edges.

Command List and Quick Open use:

- one focused query line;
- one compact result list;
- a selected row expressed through type, wash, and hairline; and
- one quiet empty/error line.

Command List is `Cmd+Shift+P` / `Ctrl+Shift+P`. Every result comes from the production command
registry and displays the platform-correct binding from that same entry.

The Shortcut Reference is a fixed two-column view of the same registry. It never becomes a second
hand-maintained shortcut inventory.

## 15. Settings

Settings is one transient typographic sheet. Values apply immediately and persist through the
versioned settings owner. There is no Apply, Save, Cancel, or advanced accordion.

Settings opens from the command list or `Cmd+,` / `Ctrl+,`. It is not a persistent row in the
Threads hierarchy.

Initial groups are:

1. **Appearance:** theme file, system/light/dark behavior, warmth, prose size, code size, heading
   scale.
2. **Reading:** Focus on/off, dim level, granularity, Typewriter Mode, Word Wrap.
3. **Workbench:** Threads full/collapsed/hidden, Files visible/hidden, centre overlap/side by side,
   region sizes.
4. **Attention:** desktop notification behavior, global sound off/on, per-agent sound, mute.
5. **Diagnostics:** instrumentation off/on, storage location, retention, reveal diagnostics.
6. **Shortcuts:** current bindings, editable window bindings, and native global registration state.
   Capturing a new binding refuses conflicts, applies immediately, persists locally, and offers a
   reset to the registered default. Native global bindings remain operating-system managed and do
   not pretend to be editable.

Choice controls are inline words. Continuous values use a minimal hairline track plus text value.
Toggles use `on` and `off`. Active values use weight, underline, and accessible selected state.

Unavailable settings remain visible with an explanation. Invalid theme, shortcut conflict,
notification denial, or diagnostic write failure appears beside the relevant row.

## 16. Notifications and attention

Thread attention first appears in the Threads row. Desktop notification and sound are optional
presentations of that same state.

A notification title uses `zd`; supporting text names project, thread, and agent type. It never
includes prompt, response, terminal output, document content, or file path. View is a named action
that summons and activates the exact target. Close only dismisses the operating-system notification.

Completion sound is off by default. Enabled sounds are short, non-overlapping, and rate-limited.
The workbench does not play ambient audio.

When the target thread is already visible and focused, the row state updates but desktop
presentation and sound are suppressed.

## 17. Status, notices, errors, and recovery

Status is local to the content it describes:

- file read/save/external-change state appears at the editor;
- tree loading/filter/watch state appears in Files;
- Git availability/history state appears in Changes;
- process state appears in the thread/terminal;
- theme and diagnostics failures appear in Settings; and
- global shortcut or notification permission failures appear in the relevant setting and one
  non-blocking workbench notice.

Notices are plain, specific text. They do not become stacked toasts, banners, badges, or modal alert
collections. When a recovery action exists, it is an inline text action in the sentence.

Dirty buffers, running processes, unavailable projects, missing worktrees, and read-only revisions
are explicit states. Switching and hiding preserve them. Removing, closing, or quitting names the
affected work and requires the owning safe action.

## 18. Interaction language

Every pointer action and keyboard action invokes the same semantic command. Every interactive
element:

- has visible text or a file/thread icon with an adjacent or revealed label;
- has a stable accessible name, role, value, and state;
- is reachable and operable without a pointer;
- retains at least a 32 px invisible hit area except dense tree/thread rows, which retain a 24 px
  accessible hit area around their 19–22 px visual row;
- shows keyboard focus without changing geometry; and
- refuses unavailable or clamped operations quietly.

Escape dismisses the active transient. With no transient, quick-access Escape hides the window; in
ordinary window mode it drops the editor caret when applicable and otherwise does nothing. One key
press never cascades through two states.

## 19. Motion

Motion is rare:

- selection, file updates, tree disclosure, project/thread switches, and incoming Focus: immediate;
- outgoing Focus context: 120 ms;
- quick-access show/hide: native immediate presentation without a custom slide or scale; and
- all other workbench state: immediate.

There are no springs, parallax, shimmer, pulsing status, animated badges, or decorative loading
effects. Reduce Motion makes the outgoing Focus change immediate.

The previous usable surface remains until replacement content is ready. A blank intermediate frame
is a defect.

## 20. Accessibility

Keyboard-only use covers launch state, project/thread/file activation, tree navigation, terminal,
editing, Find/Replace, saving, Git inspection, settings, and dismissal.

- Region order is Threads, centre-left, centre-right, Files/Changes.
- Collapsed or suppressed regions leave focus before disappearing and restore it only when the
  owning content returns.
- Project, thread, lifecycle, file type, Git state, read-only state, and errors expose semantic text
  to assistive technology.
- Virtualized trees, editor rows, history, and scrollback remain reachable through logical
  navigation rather than DOM lifetime.
- Text scaling, high contrast, colour-vision differences, Reduce Motion, IME input, grapheme-safe
  movement, low DPI, high DPI, and fractional scale are supported.
- No state depends on sound.
- Focus Mode has an obvious off state and never hides source content.

Final review covers 96 dpi 1×, high-density output, 125%, 150%, and 175% fractional scaling,
keyboard-only operation, screen-reader names/state, Current Light, Dark, Dracula, and the warmest
setting.

## 21. Performance is part of the aesthetic

CodeMirror and Lezer own incremental document work. Browser layout owns typography. The thin Tauri
shell owns files, Git, PTYs, windows, notifications, and platform configuration. Each deep module
keeps its complexity below a narrow typed boundary.

The implementation must:

- paint a useful first frame before optional Git, syntax, history, diagnostics, or terminal work;
- show input in the receiving frame;
- prepare visible content and active focus first;
- keep editor, tree, search, diff, and terminal work proportional to visible or bounded content;
- progressively load history and large directories;
- coalesce repeated resize, theme, warmth, and filesystem updates;
- avoid continuous polling, parsing, repaint, sampling, or animation while idle;
- segment pathological long lines and output bursts so none monopolizes a frame;
- cap scrollback, output queues, ignored traversal, Git history, diagnostic data, and clean caches;
  and
- preserve semantic position through project, thread, file, theme, font, region, and window changes.

Release-build fixtures record first paint, warm summon, typing, open, search, replace, scroll,
resize, project switch, tree expansion/filter/watch, Git refresh/history, terminal throughput,
inactive threads, memory, and idle CPU. Optimizations respond to measurements, not speculation.

## 22. Verification and governance

Tests live beside their deep module or at a real integration boundary.

| Verification surface | Obligation |
| --- | --- |
| `packages/app/tests/unit/` | State, commands, editor, themes, filters, lifecycles, settings |
| `packages/app/tests/e2e/` | Rendered typography, layout, focus, editing, terminal, accessibility |
| `packages/tauri/src/` tests | Native authority, CLI, Git, PTY, window, notification, cleanup |
| `packages/scripts/tests/unit/` | Repository layout, docs, release, planning and diagnostics tooling |
| Native release checks | Spaces/displays, focus restoration, file dialogs, process cleanup, scaling |

Every code change adds or updates the smallest test that proves its behavior. A reported error gets a
failing regression test before the fix. Rendering and accessibility claims require browser or native
evidence in addition to pure state tests.

A visual or interaction change requires:

1. review against VISION and accepted ADRs;
2. implementation through shared semantic roles;
3. focused automated tests;
4. proportional release-build performance review;
5. inspection in all three built-in themes and relevant accessibility settings; and
6. an update to this contract when the product decision itself changes.

Reject a change if it introduces a competing state owner, raw feature-local visual constants,
unbounded background work, generic native authority, decorative persistent chrome, an executable
theme, inaccessible status, or a public claim that behavior shipped before it did.

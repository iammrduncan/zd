# ZD current architecture and leverage points

Research snapshot: 2026-08-11, repository commit `21bc7dd`.

This is a descriptive audit of the implementation that exists, not architecture authority. Accepted
decisions remain in [`docs/adr/`](../../../../../docs/adr/README.md), while the product intent is in
[`vision.md`](../../vision.md) and the new questions are in [`thoughts.txt`](../thoughts.txt).

## Executive finding

ZD is already much closer to a reusable product core than to a monolithic native application. The
reading and editing product is a portable TypeScript/DOM/CodeMirror surface. Tauri is a thin native
authority layer reached through one frontend interface. That makes a different shell possible without
rewriting the Markdown experience.

The gaps named in `thoughts.txt` are nonetheless real: the running product has one window, one active
launch scope, one registered miniapp, no project-session model, no PTY or process supervisor, no browser
surface, and no global hotkey/show-hide behavior. The next architectural decision is therefore not
“save or discard the current app.” It is which missing capability to validate first and where the next
durable state boundary belongs.

## The implemented shape

```text
macOS / Windows
       │
       ▼
Tauri window + Rust commands
  launch/scope ─ files ─ external URLs ─ close authority
       │ typed IPC
       ▼
Platform interface (the only frontend Tauri import)
       │
       ▼
Suite shell
  boot ─ miniapp registry ─ shortcut registry ─ preferences ─ overlays
       │
       ▼
md miniapp
  workspace tree ─ review ledger ─ document lifecycle
       │
       ▼
CodeMirror document surface
  source buffer ─ Markdown decorations ─ focus ─ save/reconcile
```

### Native boundary

- Tauri owns the one configured `main` window, launch events, close refusal, file commands, and URL
  opening. The configured window is 1100×760 with a hidden overlay titlebar; there is no tray, global
  shortcut, autostart, single-instance, PTY, shell, or process plugin in
  [`tauri.conf.json`](../../../../../packages/tauri/tauri.conf.json).
- Rust parses `zd md [path]`, retains the current and pending launch requests, and derives exactly one
  file scope from the active request in
  [`cli.rs`](../../../../../packages/tauri/src/cli.rs). `MINIAPPS` contains only `md`.
- File reads, Markdown workspace enumeration, file stamps, atomic writes, and external URL validation
  live in [`fs.rs`](../../../../../packages/tauri/src/fs.rs). The walker respects hidden and Git ignore
  rules, does not follow links, and currently lists only `.md` files.
- The frontend reaches all native behavior through [`platform.ts`](../../../../../packages/app/src/platform.ts).
  That is the only frontend file importing Tauri APIs. The browser implementation is deliberately
  honest: it supplies the fixture launch but has no filesystem or native window.
- Tauri capabilities are default-deny and currently allow only core window behavior, window dragging,
  and opening URLs in
  [`capabilities/default.json`](../../../../../packages/tauri/capabilities/default.json).

This is a valuable seam, but not yet a reusable native *library*: Rust command handlers are directly
typed around Tauri state and command macros. A new webview shell can reuse the frontend immediately; a
non-Tauri native shell would either implement the `Platform` contract or first extract the path/file
logic from its Tauri adapters.

### Suite boundary

- [`main.ts`](../../../../../packages/app/src/main.ts) registers exactly one miniapp and starts the
  suite.
- [`types.ts`](../../../../../packages/app/src/suite/types.ts) gives a miniapp only an immutable launch
  request and a `Platform`; the entire mount contract is “fill this element and return teardown.”
- [`registry.ts`](../../../../../packages/app/src/suite/registry.ts) makes adding another in-process
  miniapp cheap, and [`boot.ts`](../../../../../packages/app/src/suite/boot.ts) owns cross-miniapp boot,
  shortcut dispatch, reference overlay, and presence behavior.
- [`shortcuts.ts`](../../../../../packages/app/src/suite/shortcuts.ts) is a window-local command
  registry driven by DOM `KeyboardEvent`s. It deliberately cannot receive a chord while another app is
  active; a global hotkey requires native registration below this layer.
- Suite preferences use web `localStorage` with a memory fallback in
  [`preferences.ts`](../../../../../packages/app/src/suite/preferences.ts). This is convenient and
  portable, but it is not yet a versioned project/session store.
- The miniapp rules already classify the future terminal as a suite overlay rather than a miniapp in
  [`miniapps/README.md`](../../../../../packages/app/src/miniapps/README.md). That is design intent,
  not an implemented terminal.

The registry is a good extension point for focused tools. It is not a project/session manager. There
is no stable project ID, recent-project catalog, active-project collection, per-project set of open
documents/terminals, tab model, or serialization format.

### Markdown product boundary

- [`md/index.ts`](../../../../../packages/app/src/miniapps/md/index.ts) owns one document's load,
  editor, shortcuts, save/reconcile, close confirmation, status, and review wiring.
- [`workspace/index.ts`](../../../../../packages/app/src/miniapps/md/workspace/index.ts) displays one scoped tree and
  replaces the mounted editor completely when another file is chosen. It safely refuses a switch over
  unsaved work. It does not retain multiple open document buffers or tab state.
- [`editor/editor.ts`](../../../../../packages/app/src/miniapps/md/editor/editor.ts) composes CodeMirror
  with the product's rendered-but-editable Markdown model. Focus, notation, tables, lists, raw mode,
  language selection, motion, and review annotations are separate modules under the same directory.
- [`markdown.ts`](../../../../../packages/app/src/miniapps/md/markdown.ts) disables raw HTML, relies on
  Markdown-it protocol validation, and removes remote images in an inert template before live DOM
  insertion.
- Review comments are a workspace ledger persisted in `localStorage`, not yet a repository document
  or shared service, in [`review/index.ts`](../../../../../packages/app/src/miniapps/md/review/index.ts).

CodeMirror is therefore both a strength and a material dependency. ZD's differentiating interaction
is implemented with CodeMirror state fields, view plugins, decorations, atomic ranges, keymaps, and DOM
measurement. It can move to another DOM/webview shell. It cannot be dropped into a native editor host
that does not permit arbitrary web UI without either keeping CodeMirror as a nested editor or rewriting
the central experience against that host's editing primitives.

## Capability inventory against the new goal

| Desired capability | Current evidence | Gap |
| --- | --- | --- |
| Rendered, always-editable Markdown | Implemented as one CodeMirror source buffer and decorated surface | Refinement remains, but the architectural core exists |
| Code viewing/editing | Language selection and syntax support exist; the vision treats non-Markdown files as a convenience | Workspace enumeration is Markdown-only and there is no IDE/project tooling contract |
| One workspace file tree | Scoped, ignored-aware Markdown tree is implemented | One active root; no stable project catalog, multi-root session, recents, or retained tabs |
| Project switching with `Cmd+1…9` | No model or commands | Needs a suite-owned session model below UI |
| Terminal | Only design notes in [`goals/zd-terminal`](../../goals/zd-terminal/initial_thoughts.md) | No PTY, emulator, process lifecycle, scrollback, tabs, splits, or resize protocol |
| Agent steering | Markdown review feedback and repository session-loop scripts exist | No live agent process abstraction, protocol adapter, permissions UI, or status stream in the app |
| Global summon/dismiss | No native plugin or window methods | Native global shortcut plus show/focus/hide/Space behavior is required |
| Browser handoff | A scoped `openExternal(http/https)` boundary exists | The user-visible Markdown navigation path and any integrated browser/session control remain unfinished |
| Browser inside ZD | None | Requires a remote webview, controlled browser bridge, or companion extension—and a new threat model |
| Multiple ZD windows | Product vision asks for it | Config and runtime create one labeled window; state types assume one current launch session |
| Local-first behavior | Local documents/fonts; remote images blocked | Native windows connect to SSPS by default unless disabled; browser/agent integrations would add new egress |

## Dependency and lock-in map

| Dependency | Present coupling | Exit cost | Architectural response |
| --- | --- | --- | --- |
| CodeMirror 6 | High in the editor experience; many product behaviors use CM-specific ranges, decorations, and measurement | High if moving to another editor engine; low if retaining a DOM/webview | Treat the CodeMirror document surface as a product asset, not an incidental implementation |
| Browser DOM/CSS | High in layout, focus, typography, tests, and miniapp mounting | High for a native-only host; low across Tauri, browser, Electron, or host webviews | Prefer shells that can host the current DOM when product fidelity matters |
| Tauri 2 | Narrow on the frontend, moderate in Rust adapters/config/packaging | Low for another Tauri window mode; moderate for another native shell | Extend the current boundary for proven needs; keep Tauri types out of product modules |
| Markdown-it/Shiki | Encapsulated behind rendering/language modules | Low to moderate | Preserve the safe-renderer contract if swapped |
| `localStorage` | Preferences, review ledger, visitor identity | Moderate once project/session state grows | Do not put the project/session graph here; introduce an explicit, versioned store |
| OS filesystem paths | Launch request and review identity use path strings | Moderate for remote projects, renamed roots, or sandbox bookmarks | Add stable project IDs and keep path authority in adapters |
| Host editor/terminal APIs | None today | Potentially very high after adoption | Any host integration should be an adapter or companion first, not the owner of ZD state |

The most important lock-in distinction is **engine versus shell**. ZD is deliberately locked into its
CodeMirror-based experience because that is where product value lives. It is only lightly locked into
Tauri as a shell. Moving into a host that cannot run that experience would exchange the cheap lock-in
for the expensive one.

## Security and privacy posture

### Existing strengths

- File authority follows the active launch scope, with canonicalization and symlink escape checks.
- Markdown is explicitly untrusted; raw HTML, unsafe link schemes, and remote images are stopped at
  separate layers. See the accepted
  [untrusted-Markdown ADR](../../../../../docs/adr/md/0004-treat-rendered-markdown-as-untrusted_H.md).
- The CSP in [`tauri.conf.json`](../../../../../packages/tauri/tauri.conf.json) allows local assets and
  the explicit SSPS websocket, rather than general network access.
- External URLs are limited again at the Rust boundary to HTTP(S).
- Tauri plugin commands are denied until individually allowed.

### New threat boundaries implied by the goal

- **Terminal/process:** a PTY is intentionally arbitrary code execution as the user. The webview must
  not receive a generic `exec(command)` capability. A deep terminal service should create a process
  only for an explicitly selected project, pass structured argv/environment, bound scrollback and
  output, clean descendants on close, and never expose secrets in logs.
- **Agent harnesses:** each agent may read the project, spawn commands, use provider credentials, and
  send content off-device. Authentication, provider terms, tool approval, and sandboxing remain the
  harness's responsibility unless ZD explicitly assumes them. ZD should show which process and cwd it
  launched without silently merging credentials across harnesses.
- **Browser:** embedding arbitrary remote pages in a privileged webview collapses the present CSP and
  content boundary. A remote page must never share Tauri IPC capability with the local app surface.
  External-browser or extension bridges should expose narrow semantic messages, not file paths plus a
  general command channel.
- **Global shortcut:** registration affects every app and can capture an expected system/application
  chord. It must be configurable, collision-aware, and disabled cleanly on quit or preference change.
- **Host plugins:** the host's updater, marketplace, extension permissions, and API churn become part of
  ZD's supply chain and security model. A host process with broader workspace authority can enlarge the
  current one-root blast radius.
- **Session persistence:** terminals and project graphs will contain cwd, commands, document names, and
  possibly agent metadata. Store only what is needed, version it, avoid environment snapshots and
  transcript persistence by default, and make deletion predictable.

The one current privacy caveat is [`presence.ts`](../../../../../packages/app/src/suite/presence.ts):
native windows create a persistent anonymous visitor ID and connect to SSPS by default. The user can
globally disable it. Any claim that a future ZD shell is fully local/offline must name this exception or
change that policy separately.

## Natural seams versus premature abstractions

The code already identifies three credible cut points:

1. **Document surface:** mount a source-backed editor into a DOM element; report dirty/save/switch
   state. This exists, although some lifecycle types remain local to `md`.
2. **Platform capabilities:** scoped files, window lifecycle, external navigation. This exists and can
   grow, but PTY, browser, and project storage should be coherent deep capabilities rather than dozens
   of thin pass-through methods on one giant interface.
3. **Suite session:** project identities, active project, open documents, terminal/agent handles, and
   persistence. This does not exist and is the next necessary product model for `Cmd+1…9`.

There is not yet evidence for a universal plugin SDK, a cross-host layout framework, or a general agent
orchestration protocol owned by ZD. Per the repository's engineering guidance, those abstractions
should wait for a working second consumer. The immediate global-overlay experiment needs none of them.

## Architectural conclusion

The current implementation supports a low-risk sequence: add the macOS summon/dismiss behavior to the
existing Tauri shell; introduce a small suite-owned project/session model when project switching lands;
connect external terminals and browsers through narrow bridges; and extract a reusable package only
when a second shell proves the actual boundary. A wholesale move into Zed, Warp, Ghostty, or another
host would discard the strongest existing asset—the document surface—before proving that the host can
carry it.

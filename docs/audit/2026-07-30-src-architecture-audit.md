# `src/` architecture audit — 2026-07-30

Reviewer stance: senior TypeScript fullstack developer, desktop apps on Tauri and
Electron. Scope: `src/` and the IPC boundary it depends on (`src-tauri/src/`),
plus the build, test, and security posture around them. Method: read every file
in `src/suite/`, `src/platform.ts`, `src/miniapps/md/` (all of `editor/` and
`reader/`), the Rust commands, the configs, and the test tree; ran
`npm run check` (green: typecheck, lint, 230 unit tests).

## Verdict

This is an unusually well-built codebase for its age. The architecture is sound,
the module boundaries are real, and the code records *why* it exists at a level
most teams never reach. The findings below are mostly about the seams that have
not been load-tested yet — the save pipeline's failure path being the one that
matters most — not about structural problems. Nothing here calls for a rewrite
of anything.

What is notably right, so the findings sit in context:

- **The platform seam is genuine.** `src/platform.ts` is the only file that
  imports `@tauri-apps/api`, the browser fallback is honest rather than a mock,
  and the Rust side is five commands. This is the single most important
  architectural decision in a Tauri/Electron app and it is correct here.
- **Deep modules, per the project's own doctrine.** `Editor` wraps all of
  CodeMirror behind ~15 methods; `reconcile.ts` is a pure decision function;
  `measure.ts` traps a subtle CodeMirror scheduling hazard behind two methods.
- **The atomic save is done properly**: sibling temp file (same filesystem),
  `sync_all` before rename, permission preservation, directory fsync, and every
  one of those choices is tested (`fs.rs`).
- **The untrusted-input story is layered**: `markdown-it` with `html: false`,
  parsing inside inert `<template>` fragments, remote images replaced before
  they can fetch, scheme allowlist in Rust for `open_external`, and a CSP
  backstop. `shiki` runs as a classifier so no colour bypasses the token system.
- **The test strategy matches the stated philosophy**: coarse e2e tests
  (~9,400 lines) verifying geometry and behavior, unit tests where logic is
  pure, invariant guards (token references, task-file grammar, widget margins).

Findings are ordered by how much they matter, not by where they live.

---

## High

### H1. A failed or refused save silently reports the document as saved

`editor.ts` marks the buffer clean *before* the write happens, and nothing can
undo that when the write does not:

```ts
// src/miniapps/md/editor/editor.ts:358
save: () => {
  written = view.state.doc;        // marked saved…
  options.onSave?.(written.toString());  // …before the async write even starts
  recheck();
},
```

`onSave` in `src/miniapps/md/index.ts:121-141` is fire-and-forget async. Three
failure paths fall through it:

1. **The clobber refusal** (`index.ts:133-136`): the save is correctly refused
   because someone else wrote the file — but the editor has already marked
   itself clean. `cmd+i` now reports "saved" for a buffer that was never
   written, and the refusal notice disappears after ten seconds (see M3).
2. **A write error** — disk full, permissions, a read-only file, the directory
   deleted: `writeTextFile` rejects inside `void (async () => …)()` with no
   `catch`. The rejection is unhandled, the user sees nothing, and the editor
   says "saved". Quit the app and the work is gone. The Rust side went to great
   lengths to make the *file* safe under failure; the frontend then loses the
   *buffer's* honesty under the same failures.
3. **Two rapid `cmd+s` presses** race: each does stamp-check → write →
   re-stamp with no serialization, so the second save can stamp the disk after
   the first save's write but before `known` is updated, and the user gets a
   spurious "this file changed on disk" warning for their own write.

This inverts the project's own hierarchy of guarantees: vision §6.3's whole
point is that what you wrote is still there.

**Recommendation.** Invert the ownership of "saved": the editor should not
update `written` until the owner confirms the write happened.

- Change `onSave` to return `Promise<void>` (or make `save()` async and have it
  await). `written` and `recheck()` move to the resolution path; a rejection
  keeps the buffer dirty and surfaces one calm sentence through the existing
  notice strip.
- Serialize saves: keep one in-flight save promise and chain the next save
  behind it. This removes the double-`cmd+s` race without locks.
- Per AGENTS.md, write the failing test first: a unit test that a rejecting
  `onSave` leaves `isDirty()` true is enough to pin the contract.

This is the one finding I would fix before anything else in the plan.

---

## Medium

### M1. `Ctrl` is treated as `Cmd` on macOS, shadowing standard text-editing keys

```ts
// src/suite/shortcuts.ts:123
const mod = event.metaKey || event.ctrlKey;
```

Matching either physical modifier means that on macOS — the platform DESIGN.md
§8 names primary — `ctrl+e` matches the `mod+e` raw-mode chord, `ctrl+s`
matches save, and `ctrl+.` opens the Reference. macOS ships emacs-style
`ctrl+e` (end of line), `ctrl+a`, `ctrl+k` etc. as system-wide text-editing
keys, and CodeMirror's `defaultKeymap` implements them — but the suite registry
listens in the **capture phase on `window`**, so it wins before the editor ever
sees the key. Concretely: a Mac user pressing `ctrl+e` to go to end-of-line
toggles raw mode instead.

**Recommendation.** Resolve `mod` per platform: on macOS require `metaKey` and
require `ctrlKey` to be false; elsewhere require `ctrlKey`. `currentPlatform()`
already exists in the same file. One unit test with a synthesized
`ctrlKey: true` event on the mac path pins it (the existing test suite already
knows Playwright cannot exercise platform modifier composition honestly — same
reasoning as the Alt/`Ω` case documented at `shortcuts.ts:128-148`).

### M2. The filesystem IPC surface is unscoped

`read_text_file`, `write_text_file`, and `file_stamp` (`src-tauri/src/fs.rs`)
accept any absolute path the webview sends. Today the only caller passes the
launch path, so there is no bug — but the trust boundary is worth hardening
now, because this app's entire purpose is rendering **untrusted, agent-written
markdown**, and a webview compromise (a renderer bug, a future regression in
the markdown pipeline) currently converts to arbitrary file read/write as the
user. AGENTS.md's own security section says to think in blast radius; the blast
radius of these three commands is the whole home directory.

**Recommendation.** Have the Rust side remember the launch scope (the file or
folder from `launch_request`) and refuse paths outside it — canonicalized, so
`..` and symlinks cannot escape. This is cheap now (one state struct, one
check), and ADR 0002's workspace model needs exactly this scope anyway when the
sidebar and quick-open land. It also composes with M5 (`..` normalization).

**Closed 2026-07-30**, exactly as recommended. `fs::Scope` holds the launch
folder, `within_scope` canonicalizes and refuses anything outside it, and all
three commands go through it. Two things worth recording:

- The scope is read from `cli::launch_request()` **in `run()`**, not from the
  frontend's call to it. A boundary the untrusted side can decline to establish
  is not a boundary.
- `file_stamp` reports `None` for an out-of-scope path rather than erroring.
  Its contract is already that a missing file is a state rather than a failure,
  and it is asked on every window focus — a loud refusal would put a scope error
  on the §7.3 notice every time the window came back.

L5 and L6 are answered by the same canonicalization: paths are resolved before
use, so `..` cannot survive into a comparison and a write follows a symlink to
its target instead of replacing the link.

### M3. Data-loss warnings ride a ten-second strip

`showNotice` routes every message through the status strip with a 10s dwell
(`src/miniapps/md/status.ts:19`). That is right for a word count; it is wrong
for the three §6.3 messages whose entire job is to prevent loss:

- "This file changed on disk. Nothing was written — copy your work…"
- "This file is no longer on disk. What is on screen is unsaved — save it somewhere."
- "…you have unsaved edits. Neither has been touched."

Look away for ten seconds and the only evidence of a refused save is gone —
compounded today by H1 reporting the buffer as saved. DESIGN.md already
distinguishes these cases: §7.3 defines a *persistent* document-local notice
line for exactly the vanished-file state ("file no longer exists", withdraws
when the path reappears, never a button). The current implementation puts that
message on the transient strip instead.

**Recommendation.** Implement §7.3's persistent document-local banner and route
`vanished` and `keep`/refused-save notices through it; keep the strip for
status. The banner clears when the condition clears (path reappears, next
successful save) rather than on a timer.

### M4. Boot has no failure surface

`src/main.ts:14` is `void boot(host, detectPlatform())`, and the first thing
`boot` does is `await platform.launchRequest()`. If that invoke rejects — an
IPC misconfiguration, a capability regression, anything on the Rust side —
the rejection is unhandled and the user gets a permanently blank window, which
is precisely finding F02's failure shape arriving through a different door.

**Recommendation.** One `try/catch` in `boot` that renders a single sentence
into `host` ("zd could not start: …"). Cheap, and it converts the worst
diagnostic experience (blank window) into the best (the reason, on screen).

### M5. No CI

`npm run check`, the Playwright suite, `cargo test`, and `cargo clippy` all
exist and all pass — and nothing runs them on push. The session workflow runs
them locally, but the repo's own way-of-working leans hard on guards, and a
guard that only runs when someone remembers is the drift F16 describes.

**Recommendation.** One GitHub Actions workflow on a macOS runner:
`npm ci && npm run check && npm run test:e2e`, plus
`cargo test && cargo clippy --all-targets` in `src-tauri/`. Pin with `npm ci`
against the existing lockfile (see L4).

---

## Low

### L1. Layering inversion: the platform imports a type from a miniapp

`src/platform.ts:3` imports `FileStamp` from `@/miniapps/md/reconcile`. The
platform is the bottom layer — miniapps consume it through `ctx.platform` — so
the bottom layer naming a type owned by the layer above it is backwards, and it
means a future `zd td` that touches files inherits a type from `md`'s
directory. Move `FileStamp` to `platform.ts` (it describes what `file_stamp`
returns, so that is its honest home) and have `reconcile.ts` re-export or
import it.

### L2. Dead editor option: `onStatus`

`EditorOptions.onStatus` (`src/miniapps/md/editor/editor.ts:159`) is declared
and documented but never invoked anywhere in `src/` or `tests/`. The status
command reads `text()`/`isDirty()` directly instead, which is the better
design — so delete the option. (`onDirtyChange` *is* wired inside the editor
and merely has no caller yet; that one is documented as waiting for §7.10's
strip and can stay.)

### L3. Duplicated comment block in `index.ts`

The "file as we last agreed with it" paragraph appears twice, at
`src/miniapps/md/index.ts:79-88` and again at `:109-117`, an artifact of the
`known` declaration moving. Keep the outer one.

### L4. Dependency pinning does not match the stated policy

AGENTS.md says "pin versions"; `package.json` uses `^` ranges throughout. The
lockfile makes local installs reproducible, but only if CI and docs use
`npm ci` (see M5). Consider `save-exact=true` in `.npmrc` for new adds. Also
`@types/markdown-it` sits in `dependencies` but is a dev-only type package.

### L5. `absolutize` normalizes `.` but not `..`

`src-tauri/src/cli.rs:88` strips `CurDir` components only, so
`zd md ../notes/plan.md` keeps the `..` in the path the frontend receives.
Harmless for I/O, but the moment paths are compared textually — recents,
sidebar selection, "is this file already open" — one file can have two
spellings. Canonicalizing at the scope boundary (M2) resolves this too.

### L6. Atomic save changes the identity of special files

`rename` over a path that is a **symlink** replaces the symlink itself with a
regular file (breaking dotfile-manager setups), breaks **hard links**, and
makes file watchers see delete+create. Every editor with atomic saves faces
this trade (VS Code ships a fallback setting for it). Not a defect today —
but worth one sentence of decision record in `fs.rs`, and `fs::canonicalize`
before writing would fix the symlink case for free alongside M2.

### L7. Module-level shared state in `reader/focus.ts`

`scrollIsOurs` (`src/miniapps/md/reader/focus.ts:217`) is a module variable.
The project's own rule elsewhere — granularity, raw mode — is that per-surface
state lives on the surface, "so two windows never share one". Two mounted
readers would share this flag. Consequence today: none (one window). Worth
aligning when a second window or split lands.

### L8. Section-granularity focus walks the whole document per update

`sectionRange` (`src/miniapps/md/editor/focus.ts:224-257`) collects every
top-level block on each recompute, and `nearestContentPos` can scan far on
blank-heavy documents. Painting is viewport-bounded; these walks are not.
Fine at today's sizes, but ADR 0003's budget is "work proportional to the
viewport", and megabyte agent logs are the product's stated diet. Cheap fix
when it matters: early-exit the section walk once past the viewport, or memoize
by tree identity. Flagging so it is a decision, not a surprise in a profile.

---

## Things reviewed and deliberately not filed

- **Bundle size** (1.1 MB dist): CodeMirror is the bulk, shiki is already
  dynamically imported with the JS regex engine instead of the 622 kB wasm, and
  for a desktop webview this is a non-issue. No action.
- **Two markdown parsers** (markdown-it in the reader, Lezer in the editor):
  looks like duplication, is actually the right tool on each surface, and the
  code already confines the risk (shared inline renderer for widget content,
  shared highlight classes, GFM dialect matched on both sides). No action.
- **E2E-heavy test pyramid**: inverted relative to convention, deliberate per
  the project's testing philosophy, and the specs measure geometry a unit test
  cannot. The one real gap — nothing drives the actual WKWebView shell — is
  already acknowledged in the README as a manual step per phase. A
  `tauri-driver` smoke test is worth considering at ship time (`+p5`), not now.
- **CSP** (`tauri.conf.json`): tight for this app. `style-src 'unsafe-inline'`
  is required by CodeMirror; `img-src asset: data: blob:` is scoped. Fine.
- **`localStorage` for preferences** (`suite/preferences.ts`): the
  file-behind-settings question is already flagged in-code for session 4.4, and
  the accessor seam makes the migration one file. Agreed; nothing to add.

## Suggested order of work

| # | Finding | Effort | Why this order |
|---|---------|-------:|----------------|
| 1 | H1 save honesty (async save + serialized writes) | ~1 session | Only finding with silent data loss |
| 2 | M1 mac `ctrl` ≠ `cmd` | ~30 min | User-visible on the primary platform every day |
| 3 | M3 persistent banner for §6.3 notices | ~1 session | Completes H1's fix; spec already defines it |
| 4 | M4 boot failure sentence | ~15 min | Cheapest insurance in the list |
| 5 | M5 CI workflow | ~30 min | Locks in everything above |
| 6 | M2 scope the FS commands | ~1 session | Best done with, or just before, phase 2 workspace |
| 7 | L1–L8 | opportunistic | Fold into sessions that touch those files |

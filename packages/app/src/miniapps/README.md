# Mini apps

One directory per `zd <thing>` surface you launch into. `md` is tool #1; `td` is next.

## What is not a mini app

The in-app terminal and the Shortcut Reference open **over** whichever mini app is already
mounted — you do not launch into them, and there is no sense in opening a terminal from a
terminal. They are suite surfaces: they live in `src/suite/`, they are reachable from every mini
app and from studio, and a mini app never registers, hosts, or cooperates with them.

If a thing answers "which mini app am I in?" with "any of them", it is not a mini app.

## Adding one

1. `src/miniapps/<id>/index.ts` exporting a `MiniApp` (see `@/suite/types`):

   ```ts
   export const td: MiniApp = {
     id: "td",
     title: "zd td",
     mount(host, ctx) {
       /* fill host, return a teardown */
     },
   };
   ```

2. Register it in `src/main.ts` — one line.
3. That is all. Routing, the design system, and the window are already handled.

## Rules

- **A mini app never defines a font family, a size, or a colour.** It selects a
  semantic role from `src/design/tokens.css`. Changing `DESIGN.md` must change
  every mini app at once; a local hex value breaks that and is a bug.
- **A mini app never talks to the shell.** File access, launch arguments, and
  external links come through `ctx.platform`. `src/platform.ts` is the only file
  that imports `@tauri-apps/api`.
- **A mini app owns its own directory and nothing else.** Shared behavior moves
  to `src/suite/` only when a second mini app actually needs it — not before.
- **500 lines is a warning, not a wall.** When a file trips it, split at the
  nearest seam in the same session. The first prototype's `app.rs` reached
  14,211 lines because nothing ever said stop.

## Backend commands

Rust commands live in `packages/tauri/src/` — one module per concern (`cli`, `fs`,
`git`), registered in `lib.rs` and surfaced to the frontend through
`src/platform.ts`. Keep this side thin: it is a file, git, and window layer, not
where the product lives.

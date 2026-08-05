# zd

Zen Suite — a small suite of tools that follow my AI assisted development and review flow.

Tool #1 is `zd md`, the markdown reader/editor. It's first because reading crap tons of markdown is the most painful part of my day right now.

## What is `zd md`

Simple markdown viewer/editor that makes it so you don't hate your life as you read the miles long documents that AI generates for you to review.

Has a bunch of features to make focus better and allow you to make changes/suggestions as they go.

Launch it with `zd md .` for the current folder, `zd md <file>` to open one file (created if it doesn't exist), or `zd md` on its own for the home screen.

## Zen Suite

Zen Suite will be a small collection of tools that mimic my every day workflow and cover how I work with AI coding assistants through:

- todo lists
- goals and loops
- BDD management
- Doc review (`zd md`) — tool #1, in progress
- Workflow review via mermaid docs
- Alerting

They will start as focused tools that codify what I do every day, then expand to allow AI to interact with them too.

Eventually this will all live under one cli/tool called `zd` aka Zen Todo/Doc/MD etc... so you'll be able to do `zd md .` or `zd td ls` or `zd bdd review` or `zd mer view` or `zd studio` etc...

Starting with markdown reader cause thats my most painful part of my day is reading crap tons of markdown and actually groking it.

`zd init` will update a folders structure or scaffold a project with my standard bits such as my standard CLAUDE.md, goal folder, .gitignore, etc.

## Development

`zd` is a [Tauri](https://tauri.app) desktop app: a TypeScript frontend where the product lives,
on a thin Rust shell that handles files, git, and windows. One binary, one window, and a mini app
registry that `md` is the first entry in.

Why not the Rust/egui version that was here before: [`docs/path-forward.md`](docs/path-forward.md).
It is archived at tag `rust-prototype`.

Needs [Node](https://nodejs.org) and [Rust](https://rust-lang.org/tools/install/).

```sh
npm install
npm run app                          # the desktop app, no document
npm run app:open -- md README.md     # the desktop app, opening a file
npm run dev                          # the frontend alone, in a browser
```

### Install globally on macOS

There is not an automated installer yet. Build the release app, copy it into `/Applications`,
then link the executable inside the app bundle into `/usr/local/bin`:

```sh
npm install
npm run tauri -- build --config packages/tauri/tauri.conf.json --bundles app
sudo ditto packages/tauri/target/release/bundle/macos/zd.app /Applications/zd.app
sudo mkdir -p /usr/local/bin
sudo ln -sf /Applications/zd.app/Contents/MacOS/zd /usr/local/bin/zd
```

The installed command resolves relative paths from the directory where it is invoked, so it works
outside this repository without `npm run`:

```sh
command -v zd
zd md .
zd md README.md
```

If `command -v zd` prints nothing, add `/usr/local/bin` to the shell's `PATH` or put the symlink in
another directory that is already on it. Rebuild and repeat the `ditto` command to update the app;
the symlink continues pointing at the installed bundle.

`app:open` exists because reaching the app by hand is otherwise a puzzle twice over. Tauri wants
`tauri dev -- [runnerArgs] -- [appArgs]` and `npm run` eats one `--` of its own, so it takes three
of them; and `tauri dev` runs the binary from `packages/tauri/`, so a relative path resolves
against the wrong directory. The script absorbs both — it passes npm's `INIT_CWD` through as
`ZD_CWD` so development resolves paths the way a shipped binary does.

### Looking at it in a browser

`npm run dev` has no filesystem — `packages/app/src/platform.ts` says so honestly rather than
faking one — so it cannot open a document. Dev-only pages exist for looking at the work, and none
of them ships in the production build:

| URL                                | What                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| `localhost:1420/dev/editor.html`   | A sample document on the real editor surface. Focus, type, render. |
| `localhost:1420/dev/specimen.html` | Every type role and colour role, with a light/dark/system toggle.  |

They live in `packages/app/dev/` beside the app they exercise. The package root's `index.html` is
the only entry point that ships.

`dev/editor.html` mounts the same editor module the mini app uses over an in-memory document, so
what you see and what the end-to-end tests measure is the product surface without a fake
filesystem.

Checks:

```sh
npm run check      # typecheck + lint + unit tests
npm run test:e2e   # Playwright, against the dev server
npm run format     # prettier

cd packages/tauri && cargo test && cargo clippy --all-targets
```

Playwright drives Chromium. The app ships on WKWebView, so a green suite is not the same as
verified on the real shell — the desktop app is still worth opening by hand.

### Where things are

| Path                        | What                                                |
| --------------------------- | --------------------------------------------------- |
| `packages/app/src/miniapps` | mini apps; `md` is the reader/editor/workspace      |
| `packages/app/src/suite`    | mini app registry, boot, suite-wide state           |
| `packages/app/src/design`   | the design system, from `DESIGN.md`                 |
| `packages/app/src/platform.ts` | the only file that knows about Tauri             |
| `packages/tauri`            | the Rust shell — files, git, windows. Keep it thin. |
| `packages/scripts`          | repository session and task automation              |

Adding a mini app: [`packages/app/src/miniapps/README.md`](packages/app/src/miniapps/README.md).

### Current work

[`docs/vision.md`](docs/vision.md) is what the product should be, [`docs/todo.txt`](docs/todo.txt)
is the plan and the session log. The design system is [`DESIGN.md`](DESIGN.md), and it is the
source of truth for every size, colour, and rhythm in `packages/app/src/design/tokens.css`.

### The loop

Four project slash commands in [`.claude/commands/`](.claude/commands/) drive it:

| | |
| --- | --- |
| `/status` | Where things stand. Read-only. Run it to decide what to do next. |
| `/session` | Do one task: 30–60 min, one commit, ticked off in `todo.txt`. Takes an optional session id (`/session 1.3`). |
| `/triage` | Turn `FEEDBACK.md` notes into tasks without doing any work. |
| `/archive` | Move finished lines from `todo.txt` to `docs/todo-archive.txt`. Housekeeping, run it when a phase closes. |

With Claude Code, day to day that is one command: `/loop 60s /session until you reach the next
checkpoint`. Sessions run back to back and the run stops at the next `CHECKPOINT` line in
`docs/todo.txt` — which is the plan saying a human has to go and use the thing before more gets
built on top of it. The `60s` is the gap between them: one session finishes, a minute passes, the
next starts. Long enough to read the handoff and stop the run, short enough that an unattended run
is still continuous.

#### Running `zdloop`

`zdloop` is the Codex runner for the same workflow. Make sure `docs/todo.txt` has an open
`CHECKPOINT` before starting it. The runner launches one `$zd-session` at a time, rechecks the task
list and `FEEDBACK.md` after every session, records handoffs in `docs/session-memory.log`, and stops
at the checkpoint. It then runs one read-only Codex recap with a manual test and feedback guide.

When an interactive `zdloop` starts, it asks which Codex model and reasoning effort to use and
whether to enable Fast mode for that run. Blank model and effort answers keep the defaults in
[`.codex/config.toml`](.codex/config.toml). Answering yes enables Fast mode, which uses more
credits on supported models; answering no leaves the configured service tier unchanged. The
selection applies to every work session and the final recap without rewriting the config file.
Non-interactive runs keep the config defaults.

The defaults and spawned-agent thread cap live in `.codex/config.toml`:

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "high"

[agents]
max_concurrent_threads_per_session = 8
```

The thread cap counts spawned agents, not the primary agent; the outer loop still runs one session
at a time.

`@COMPARE` tasks still run as normal Codex sessions: they build and commit a neutral side-by-side
artifact. When the following `@DECIDE` reaches the front of the queue, the dashboard pauses before
launching Codex, shows the saved comparison handoff and decision task, and accepts your answer
directly. Mouse-scroll the handoff to recover its command and inspection notes without leaving the
decision screen. Type the decision and press Enter; zdloop passes it to one `$zd-session`, which
implements and records the choice before the loop continues. A non-interactive or `--no-tui` run
stops cleanly and tells you to restart interactively instead of repeating the unanswered decision.
These exact todo.txt tags are the control signal; the words COMPARE and DECIDE in ordinary task
prose do not affect the loop. A dry run reports the number of upcoming comparison tasks and
decision gates at the top of its summary.

```sh
npm run zdloop -- 60s                 # Run with a 60-second gap between sessions
npm run zdloop -- 60s --dry-run       # Preview the work and prompts without invoking Codex
npm run zdloop -- 60s --no-tui        # Use plain terminal output instead of the dashboard
npm run zdloop -- --help              # Show all options
```

The activity stream uses deterministic local event labels. It does not download a display model
or send tool events to a separate service.

Dashboard controls:

| Key          | Action                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| `s`          | Finish the active session, run the recap, then pause.                   |
| `x`, `Ctrl+C`| Kill the active Codex process immediately without a recap.             |
| `l`          | Toggle between summarized activity and raw Codex logs.                  |
| Mouse wheel  | Scroll the agent stream or a long recap.                                |
| `j`, `k`     | Scroll a long recap on the summary screen.                              |
| `c`          | Continue from the summary screen when runnable work exists.             |
| `q`          | Quit from the summary screen.                                           |

On a decision screen, mouse-scroll the comparison handoff, type your answer, and press Enter.
Backspace edits it; `Ctrl+C` quits.

Using the app and finding something wrong is a first-class step, not an interruption: append a
line to [`FEEDBACK.md`](FEEDBACK.md) — raw notes, no format, `!` for blocking. `/session` triages
the inbox before it picks up anything new, so what you hit while reading real documents outranks
whatever the plan said.

There are two inboxes, and they stay apart on purpose:

| | |
| --- | --- |
| [`FEEDBACK.md`](FEEDBACK.md) | Yours. What you noticed using the app. The agent never writes here. |
| [`docs/agent-findings.md`](docs/agent-findings.md) | The agent's. Things it hit mid-session that were out of scope, and questions the spec does not answer. |

Both feed `todo.txt`, tagged `+fb` and `+found` so they stay tellable apart. Yours is triaged
first. Keeping the agent out of `FEEDBACK.md` is what makes
[`docs/feedback-archive.md`](docs/feedback-archive.md) trustworthy evidence later — when a fix
lands wrong, the raw human complaint is the thing worth re-reading.

The rules the sessions run under, and why they exist, are in
[`docs/path-forward.md`](docs/path-forward.md). The whole loop is written up — generalized, with
templates — in [`docs/way-of-working/`](docs/way-of-working/), so it can be dropped into another
repo.

### AntikySite mirror

AntikySite temporarily vendors this loop at `../emberwyrd/antikysite/packages/zdloop`. Every change
to the `zdloop` process or TUI under `packages/scripts/` must be ported there with its regression
tests. When a loop workflow changes, keep AntikySite's `.claude/commands/` and `.agents/skills/zd-*`
adaptations aligned too. This manual mirror goes away once AntikySite can consume a released `zd`
package.

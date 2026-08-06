[Website](https://getzensuite.com) &nbsp;·&nbsp; [docs](https://getzensuite.com/docs) &nbsp;·&nbsp; [Discord](https://discord.gg/3Qs2uejUf9)

# zd

`zd md` is a calm, keyboard-first Markdown reader and editor for the long documents that coding
agents produce. It keeps Markdown editable while giving it the measure, hierarchy, focus, and
motion of a dedicated reading surface.

`zd md` is the first tool in Zen Suite: one `zd` command for small tools that support
AI-assisted development and review.

![zd md Markdown reader showing a focused paragraph in a workspace](docs/user-facing-docs/assets/zd-reader.jpeg)

## Install on macOS

Download the Apple Silicon or Intel DMG and its checksum from the
[latest release](https://github.com/iammrduncan/zd/releases/latest). The v0.1 build is ad-hoc signed,
but not Developer ID signed or notarized.

Follow the [macOS installation guide](docs/user-facing-docs/how-to/install-macos.md) to verify the
download, copy the app, and put `zd` on PATH.

## Install on Windows

Download the Windows x64 setup executable and its checksum from the
[latest release](https://github.com/iammrduncan/zd/releases/latest). The v0.1 Windows installer is
not code signed, so Windows may show a SmartScreen warning.

Follow the [Windows installation guide](docs/user-facing-docs/how-to/install-windows.md) to verify
the installer before running it.

## Open a document

```sh
zd md .              # open the current folder
zd md README.md      # open one file
zd md                # open without a document
```

Relative paths resolve from the directory where the command is run. A named file can be new; `zd`
creates it on the first save.

Once a document is open, hold `Cmd+.` (`Ctrl+.` off macOS) to see the live shortcut reference.

## What is in v0.1

- One rendered, always-editable Markdown surface—no preview/edit mode switch.
- Line, paragraph, and section focus with optional typewriter motion.
- Headings, lists, quotes, code, links, images, and tables shaped for reading.
- Folder workspaces, safe saves, external-change detection, and Markdown file association.
- Local fonts and local files by default; remote images are not fetched.

macOS is the primary v0.1 target. Tagged releases also include a Windows x64 installer.

## Documentation

| If you want to… | Start here |
| --- | --- |
| Learn the reading and editing flow | [Open your first document](docs/user-facing-docs/tutorials/first-document.md) |
| Install or update the macOS app | [Install on macOS](docs/user-facing-docs/how-to/install-macos.md) |
| Install or update the Windows app | [Install on Windows](docs/user-facing-docs/how-to/install-windows.md) |
| Review Markdown with line comments | [Review with comments](docs/user-facing-docs/how-to/review-with-comments.md) |
| Look up command-line behavior | [CLI reference](docs/user-facing-docs/reference/cli.md) |
| Understand the system boundaries | [Architecture](docs/user-facing-docs/explanation/architecture.md) |
| Browse guides, decisions, and project records | [Documentation map](docs/README.md) |

## Develop

```sh
npm ci
npm run app
npm run website:dev
npm run check
```

See [Develop zd](docs/user-facing-docs/how-to/develop.md) for browser and native workflows.
The website runs at `http://localhost:3000`; `npm run website:build` writes the static export to
`packages/website/out`, and `npm run website:preview` serves that built output locally.
Contributions are welcome; read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change.

## Project status

The design system is [DESIGN.md](DESIGN.md). The [documentation map](docs/README.md) separates
accepted architecture, proposals, user guidance, internal records, and active objectives.

Licensed under the [MIT License](LICENSE).

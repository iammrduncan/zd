# Execute goal 05: Package and verify the browser host and desktop wrapper

## Prerequisites

- [Execute goal 04](_completed/execute-goal-04.md) is complete. This goal needs the final stable CLI,
  supervised child topology, exact shell bridge, retired native authority, and cross-platform cleanup
  contract.
- Goals 00–03 supply the browser, persistence, editing/Git, watcher/PTY, reconnect, and security
  evidence that installed artifacts must exercise rather than replace with packaging mocks. Goals
  03 and 04 supply runtime evidence on Linux and portable Unix paths; the owner deferred their
  native Windows process and wrapper execution to this goal on 2026-09-01.
- Release documentation may change only after an installed artifact on that platform passes the
  served-host and wrapper smoke checks in this goal.
- This goal is serialized with every prior goal because it freezes their executable names, assets,
  runtime paths, and release obligations.

### Needed from the owner before starting

Nothing. This goal does not publish a tag or change signing policy. It packages the already accepted
product for Apple Silicon/Intel macOS, x64 Windows, and x64 Linux (`.deb`) and records any platform
that cannot meet the gate.

## `/goal` objective

This goal delivers work packet 4 from
[`02-DELIVERY-PLAN.md:81-93`](../02-DELIVERY-PLAN.md#work-packet-4-release-delivery) and closes release
gate 4 at [`02-DELIVERY-PLAN.md:95-103`](../02-DELIVERY-PLAN.md#release-gates).

Ship one authoritative frontend build and the stable host/desktop executables in each supported
artifact. A release job may publish only after installing the produced artifact and proving direct
`zd serve`, browser connection, Tauri wrapper startup, graceful/forced cleanup, and absence of
orphaned descendants.

## Required outcome

When the work is complete, the repository must have:

1. one production `packages/app/dist` build embedded or bundled for `zd serve` and consumed by the
   desktop wrapper through that server; development and release may locate the bytes differently,
   but there is no independently built Tauri frontend or localhost-plugin asset path;
2. two explicit executable roles where a platform needs them: `zd` is a normal foreground console
   dispatcher for `serve` and launches the desktop executable for ordinary launch forms;
   `zd-desktop` owns the GUI/Tauri wrapper and starts the installed `zd serve` child;
3. a macOS `zd.app` containing `Contents/MacOS/zd-desktop` plus an executable
   `Contents/Resources/bin/zd`, with the installer and documented `/usr/local/bin/zd` link targeting
   the console executable while Finder/Dock/file associations target the desktop wrapper;
4. a Windows x64 NSIS package containing GUI-subsystem `zd-desktop.exe` and console-subsystem
   `zd.exe`, Start menu/file associations targeting the desktop executable, and a reversible
   per-user PATH entry for new shells so `zd serve` has ordinary console/stdout/Ctrl+C behavior;
5. a Linux x86_64 `.deb` containing `/usr/bin/zd`, a desktop launcher for the wrapper, icons/file
   associations, the same embedded assets, and declared WebKit/GTK/runtime dependencies without
   bundling a second backend;
6. release-build state/config paths shared by direct serve and the wrapper child on each platform,
   while test overrides remain private and an installed browser cannot select a state directory;
7. platform install-smoke harnesses that use temporary install/user/project roots where possible,
   launch the installed console command, parse its separate URL/secret privately, unlock Chromium,
   edit a real file, inspect Git, run a PTY probe, interrupt/reconnect, and stop with no listener or
   descendant left;
8. installed wrapper smoke evidence that launches the GUI executable, observes one child and one
   controller, reloads without duplication, exercises one client-shell action, then covers graceful
   close, unresponsive-child forced termination, crash presentation, and reaping;
9. a release workflow with macOS arm64/x86_64, Windows x64, and Linux x86_64 build jobs; each build
   checks artifact contents, installs into an isolated location or runner, runs the platform smoke
   target, creates SHA-256 checksums, and uploads only after all checks pass;
10. a publish job that depends on every platform job, verifies all collected checksums, includes the
    DMGs, Windows installer, Linux `.deb`, and checksum files, and cannot create a GitHub Release from
    a partially tested platform matrix; and
11. updated release operations and user-facing install/CLI documentation that describes the verified
    `zd serve [<folder>] [--bind <ip>] [--port]` direct-browser workflow, exact artifact/command
    locations, current signing/notarization limitations, uninstall behavior, protected-network
    requirement, and one-controller limit without claiming public hosting or managed TLS.

## In scope

- **Asset delivery.** Owns server asset abstraction/build integration, Cargo build scripts/resources,
  Tauri frontend configuration, and tests proving one byte-identical production build supplies both
  clients. Source maps or development paths must not enter release bundles accidentally.
- **Executable topology.** Owns Cargo bin targets, platform subsystem attributes, launcher dispatch,
  installed child discovery, Tauri configuration/capabilities, and artifact naming. Preserve the
  public application/command name `zd`; `zd-desktop` is an implementation artifact, not product copy.
- **Installers.** Owns `packaging/`, Tauri bundle metadata, Windows installer hooks, Linux package
  configuration, safe upgrade/uninstall behavior, and existing macOS replacement/link safeguards.
- **Release tests.** Owns `packages/scripts/` release inspection/smoke tools and their unit tests.
  Helpers must inspect and execute produced artifacts, not merely search workflow text.
- **Workflow.** Owns `.github/workflows/release.yml`, pinned actions, artifact/checksum paths, and
  workflow contract tests. Do not publish from this goal; verification ends at repository changes
  and locally/CI-runnable targets.
- **Documentation.** Owns `docs/_internal/releasing.md`, relevant user install/how-to/reference pages,
  docs indexes/tests, and removal of the experimental-only warning where packaged evidence now
  supersedes it.
- **Serialization.** No other served-workbench goal may change executable, asset, package, or
  release paths during this goal.

## Required tests and evidence

At minimum, prove:

- a clean release build fails early when frontend assets are missing/stale, embeds or installs each
  required asset once, serves the same hashed JS/CSS/font bytes in direct and wrapper modes, and
  contains no project fixture, secret, absolute build path, development server URL, or extra copy of
  the application bundle;
- `zd serve` in every installed artifact behaves as a foreground console process with separate
  URL/secret lines and Ctrl+C/SIGTERM cleanup; ordinary `zd` launches the GUI with forwarded path
  intent and does not leave a console or extra server behind;
- the macOS app has both executable roles with expected modes/architectures, passes strict codesign
  verification under the existing ad-hoc policy, the DMG verifies, and the safe installer links only
  `/usr/local/bin/zd` to `Contents/Resources/bin/zd` without replacing an unrelated command;
- the Windows installer marks only `zd-desktop.exe` as GUI subsystem, preserves stdout/stderr and
  control handling for `zd.exe`, adds/removes only its exact per-user PATH segment, targets desktop
  launch/file associations correctly, upgrades without stale binaries, and leaves user projects/
  state untouched on uninstall;
- native Windows `cargo test --workspace` runs
  `terminal::tests::disposal_terminates_the_session_job_and_its_descendant` and proves that host
  cleanup leaves no terminal descendant alive;
- the Linux `.deb` installs the exact console/desktop files and declared dependencies, its desktop
  entry/file association invokes the wrapper, `zd serve` works from PATH, upgrade replaces stale
  files, and uninstall leaves user projects/state untouched;
- direct installed smoke on each platform opens a temporary real file in Chromium, saves through
  Rust, shows a real Git change, starts/reads a PTY probe, survives one socket interruption, and exits
  with its port reusable and every child/grandchild gone;
- installed wrapper smoke sees exactly one `zd serve` child and session epoch across reload and
  secondary launch, confirms retired host Tauri commands are unavailable, performs one native shell
  action, and leaves no process/listener after normal close, forced deadline, or simulated crash;
- smoke logs and retained CI artifacts contain no process secret, source text, terminal output,
  canonical project path, environment dump, or raw private error; failure diagnostics use request/
  process IDs, outcomes, durations, and byte counts only;
- every release job runs the exact static/unit/Rust/served/native gates relevant to its platform and
  uploads nothing before installed smoke succeeds; the publish dependency list includes macOS,
  Windows, and Linux and checksum verification rejects a changed or missing artifact;
- release tests fail when either executable, an embedded asset, a smoke step, a cleanup assertion, a
  checksum, the Linux job, or a publish dependency is removed; no committed `.skip`, `.only`, or
  platform condition can make missing evidence green;
- user documentation commands match the actual installed paths and CLI parser, show direct remote
  browser access without a client helper, state protected-network/authentication/one-controller
  limits, and do not claim public Internet, collaboration, cloud, auto-install, signing, or
  notarization behavior that was not proved;
- all goal 00–04 real browser, persistence, editing, reconnect, wrapper, and security tests remain
  green against release builds; and
- `npm run check`, all Playwright targets, `cargo test --workspace`, platform package/smoke targets,
  `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, release
  workflow tests, checksum verification, and `git diff --check` pass with artifact names, sizes,
  hashes, test counts, and platform results recorded.

## Explicit non-goals

- Do not create or push a release tag, publish artifacts, modify an existing GitHub Release, or make
  external deployment changes while executing this goal.
- Do not add Developer ID/notarization, Windows code signing, Linux repository hosting, auto-update,
  package-manager taps, or an installer download service; retain and document the current signing
  policy.
- Do not add unsupported Linux architectures/formats beyond the selected x86_64 `.deb`, or claim
  that untested distributions are supported.
- Do not bundle Node, Vite, a development server, a second frontend build, a Tauri localhost backend,
  or another host implementation.
- Do not add product-managed SSH, remote binary installation, public-Internet transport, TLS/proxy
  identity, accounts, or collaboration.
- Do not weaken cleanup/security tests because a packaging tool makes process topology inconvenient.
  Change the package layout or stop and report.

## Engineering constraints

- Follow repository `AGENTS.md`, [`GOOD_ENGINEERING_H.md`](../../../../GOOD_ENGINEERING_H.md),
  [`DESIGN.md`](../../../../DESIGN.md), ADR 0009, and existing release safety/rollback behavior.
- Test package scripts with isolated explicit roots. Never run installers against real `/Applications`,
  `/usr/local/bin`, Windows PATH, or system package state during a unit test.
- Keep release jobs reproducible: locked Node/Rust dependencies, pinned actions, explicit target
  triples/runners, deterministic asset inputs, checksums, and no network-fetched runtime component
  after build setup.
- Keep destructive cleanup narrowly scoped to validated temporary/install targets and report what an
  uninstall intentionally preserves. Never use broad recursive targets or unresolved variables.
- Treat artifact inspection and execution as separate evidence. A file listing cannot prove startup,
  and a source-tree smoke test cannot prove installed paths or subsystem behavior.
- Preserve unrelated changes, use `apply_patch`, short one-line commits, and no coauthor tags.

## Completion definition

The goal and objective are complete only when one production frontend and the stable `zd` host/
`zd-desktop` wrapper are present in verified macOS arm64/x86_64, Windows x64, and Linux x86_64
artifacts; each installed platform passes direct browser and wrapper lifecycle/security/cleanup
smoke; release publishing is gated on every artifact and checksum; documentation matches only that
evidence; all prior tests remain green; and no second Tauri backend or development asset path ships.

If a supported platform cannot provide a foreground `zd serve`, exact child supervision, private
credential handoff, installed browser/wrapper smoke, or complete descendant cleanup with this
topology, stop and report the platform and failing invariant. Do not omit its job, publish a partial
matrix, or describe source-tree behavior as release evidence.

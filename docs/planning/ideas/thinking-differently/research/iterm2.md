# iTerm2 as a ZD platform layer

Research date: 2026-08-11

## Bottom line

iTerm2 is the strongest existing-app candidate for a **low-cost ZD workflow prototype**.

It already ships almost the literal interaction described in `thoughts.txt`: a dedicated system-wide hotkey window can float above full-screen applications, follow the current macOS Space, auto-hide, and retain a normal window's tab/pane hierarchy. iTerm2's default numbered tab navigation is `Cmd+number`. Each project can therefore be one tab containing terminal panes and—new in iTerm2 3.6—WKWebView browser panes. A Python API can create, select, label, rearrange, save, and restore these structures, while a script can register a WebView-backed toolbelt panel for a ZD web UI.

That is enough to test the project-switching and agent-steering experience without building terminal emulation or a new window manager.

It is not an ideal long-term foundation for the full ZD product. iTerm2 does not expose its terminal as an embeddable library, browser-specific Python APIs do not yet exist, and its extension surfaces are constrained to scripts, RPC/hooks, status components, and WebViews rather than arbitrary native panes. A deep fork would effectively be GPLv3 and inherit a large, mature Objective-C/Swift application. The best use is therefore **host an experimental ZD web surface alongside iTerm2 sessions**, not merge ZD's domain model permanently into iTerm2.

## What was evaluated

The required experience is:

1. summon/hide from any macOS app or virtual desktop;
2. preserve and rapidly switch numbered project contexts;
3. put one or more terminals, Markdown/code editing, and agent steering in each project;
4. add tasks, goals, objectives, custom agent workflows, and graphs;
5. optionally include a browser without application thrash;
6. reuse a mature terminal/platform where that reduces complexity, but avoid ecosystem lock-in that dictates ZD's product.

## Product and project status

iTerm2 is a macOS-only terminal emulator with a long production history. Its official news archive shows stable 2.0 in 2014, 3.0 in 2016, 3.1 in 2017, 3.2 in 2018, 3.3 in 2019, 3.4 in 2020, and 3.5 in 2024. The current stable line is 3.6. At research time, the [official downloads page](https://iterm2.com/downloads.html) lists 3.6.11, built June 2, 2026, as the recommended stable build for macOS 12.4 and later. This is the most mature terminal/window/session system among the candidates considered here.

Version 3.6 is also strategically different from older iTerm2: it introduced browser profiles and AI chat, moving the application closer to an integrated working environment. The browser first appeared in a July 2025 beta and shipped in the stable 3.6.1 release in September 2025. It is still a young subsystem inside a mature terminal.

Licensing requires precision. The repository's `LICENSE` file contains GPLv2, but [`COPYING`](https://github.com/gnachman/iTerm2/blob/master/COPYING) says iTerm2 is GPLv2-or-later and that Apache 2.0 dependencies make the combined application effectively GPLv3. The current README simply calls it GPLv3. Treat a distributed ZD fork or derivative integration as **GPLv3 unless legal review establishes otherwise**. Running an independent ZD service or script alongside an unmodified iTerm2 is a much cleaner boundary.

## Global hotkey and quake-style behavior

iTerm2 recognizes three relevant hotkey types:

- **Toggle All Windows** shows/hides all existing iTerm2 windows.
- **Session hotkeys** reveal a particular session.
- **Dedicated hotkey windows** associate a window with a profile and toggle it from a system-wide shortcut.

Dedicated hotkey windows can use multiple hotkeys or a double-tapped modifier. They can auto-hide when focus moves elsewhere, stay pinned, animate, or appear as floating windows above other applications' full-screen windows when the profile uses `All Spaces`. A hotkey profile set to `Current Space` moves to the visible Space each time it opens. See the official [Hotkeys](https://iterm2.com/documentation-hotkey.html) and [window profile](https://iterm2.com/documentation-preferences-profiles-window.html) documentation.

The global shortcut requires macOS Accessibility permission. Secure Keyboard Entry can interfere with other applications' global shortcuts, so the complete shortcut/secure-input behavior should be tested with the user's preferred key and password workflow.

Unlike Ghostty's macOS quick terminal, iTerm2's documentation does not carve tabs out of the dedicated hotkey window. It describes the hotkey construct as a window/profile feature, while the normal window hierarchy supports tabs and split sessions. The intended configuration should still be verified directly, especially with mixed terminal/browser panes and restoration.

## Tabs, windows, sessions, and project switching

iTerm2's hierarchy maps naturally to a prototype:

```text
dedicated hotkey window
  -> project tab
       -> terminal session/pane
       -> agent terminal session/pane
       -> optional ZD browser session/pane
```

Tabs can be reordered and moved across windows; each tab contains a split tree whose leaves are sessions. Tabs are normally selected by `Cmd+number`, and the modifier is configurable. Window selection is normally `Cmd+Option+number`. Tab numbers can be shown in the UI. See [general usage](https://iterm2.com/documentation-general-usage.html), [key settings](https://iterm2.com/documentation-preferences-keys.html), and [appearance settings](https://iterm2.com/documentation-preferences-appearance.html).

For more than nine projects, `Cmd+Shift+O` opens **Open Quickly**, which searches tab titles, commands, hostnames, profiles, directories, badges, and more. It can also restore saved arrangements. This is a better overflow interaction than inventing another project picker immediately. See the [menu documentation](https://iterm2.com/documentation-menu-items.html).

Saved arrangements snapshot windows, tabs, panes, profiles, and layout. They can be restored through the UI or Python API, including restoring a window arrangement as tabs in an existing window. [Dynamic Profiles](https://iterm2.com/documentation-dynamic-profiles.html) can also be generated as JSON/plist outside iTerm2 and are live-reloaded. These are useful provisioning and layout mechanisms, but they should not become ZD's authoritative project database.

iTerm2's session restoration uses long-lived server processes. A crash or app upgrade can leave jobs running and reconnect them when the app returns. An ordinary `Cmd+Q` normally terminates jobs, and reboot terminates them; both behavior and settings matter. For more deterministic agent continuity, tmux or a ZD-owned supervisor remains appropriate. See [Session Restoration](https://iterm2.com/documentation-restoration.html).

iTerm2 also has first-class tmux control mode. `tmux -CC` maps tmux windows/panes into native iTerm2 windows/tabs/splits and can reattach after a disconnect. A tmux tab cannot mix tmux and non-tmux split panes, so it may conflict with a project tab that also contains a browser or ZD panel. See [tmux integration](https://iterm2.com/documentation-tmux-integration.html).

## Scripting and automation

iTerm2 has a broad asynchronous Python API backed by protobuf and WebSockets. It models the app, windows, tabs, split trees, and sessions, and receives updates as the hierarchy changes. Relevant capabilities include:

- create and activate windows/tabs;
- inspect and reorder tabs;
- set variables on application, window, tab, and session contexts;
- inject text/data and run commands;
- watch focus, prompts, keyboard events, lifecycle, and custom control sequences;
- save, list, and restore arrangements;
- register functions callable from keybindings, triggers, menus, and other scripts;
- provide custom status components, context-menu items, and session titles;
- register a toolbelt tool that displays a URL in a WebView.

See the [Python API index](https://iterm2.com/python-api/), [scripting fundamentals](https://iterm2.com/documentation-scripting-fundamentals.html), [Window API](https://iterm2.com/python-api/window.html), [Tab API](https://iterm2.com/python-api/tab.html), [Arrangement API](https://iterm2.com/python-api/arrangement.html), and [Tool API](https://iterm2.com/python-api/tool.html).

The API is a credible orchestration layer for a prototype. A small ZD daemon could keep a mapping from ZD project ID to iTerm2 tab variable, ensure each project tab exists, focus it, start the desired harness in its working directory, and update status. Variables are JSON-encodable and scoped to sessions/tabs/windows/application, which is better than overloading visual titles as IDs.

Security behavior is deliberate: Python API access can be disabled, command-line scripts need user approval, and scripts launched by iTerm2 can be installed in its managed scripts directory. The official guide explains that this prevents escaped browser JavaScript or other untrusted code from silently acquiring terminal control. See [Running a Script](https://iterm2.com/python-api/tutorial/running.html) and [general preferences](https://iterm2.com/documentation-preferences-general.html).

AppleScript exists but is deprecated. New work should target the Python API, not create a new AppleScript dependency.

## Browser integration

iTerm2 3.6 can define a profile whose type is **Web Browser**. Browser sessions use WKWebView and live inside the same window/tab/split-pane hierarchy as terminal sessions. They work with hotkey windows, Open Quickly, navigation shortcuts, global search, smart selection, copy mode, keybindings, triggers, snippets, and input broadcast. Links can open in new tabs or split panes. See [Web Browser](https://iterm2.com/documentation-web.html).

This is highly relevant to ZD. A project tab could split between:

- one or more terminal agent harnesses;
- a browser profile pointed at the ZD local web UI/editor;
- a browser preview or project documentation page.

There is a second, narrower WebView route: a Python daemon can call `async_register_web_view_tool(...)` to place a URL-backed tool in iTerm2's right-side toolbelt. That could provide a persistent ZD project/status/steering sidebar while the main tab remains terminal-focused. See the [Tool API](https://iterm2.com/python-api/tool.html).

Browser constraints matter:

- Full functionality requires downloading a separate [iTerm2 Browser Plugin](https://iterm2.com/browser-plugin.html); enterprise administrators can block its bundle ID.
- The browser is explicitly not intended to replace a primary browser.
- There are no browser-specific Python APIs yet.
- Passkeys are unavailable because of WKWebView restrictions.
- Ad blocking is limited by Apple resource-fetching APIs.
- It identifies as Safari, but compatibility with the actual authenticated developer services in this workflow is unproven.
- The docs do not promise a supported JavaScript bridge between a ZD page and the controlling Python script.

The safest prototype treats the WebView as a normal client of ZD's localhost HTTP/WebSocket API. Project identity and actions flow through ZD's authenticated local service, not undocumented iTerm2 internals.

## Terminal embedding and extension boundaries

iTerm2 solves terminal emulation **inside iTerm2**. It does not document a stable library or framework for embedding its terminal renderer in another application. There are two viable integration directions:

### ZD beside/inside an unmodified iTerm2

Run ZD as a separate local service/web application. Use the Python API to orchestrate iTerm2 and expose ZD through a browser session or WebView toolbelt. This boundary preserves ZD's license and product independence while exploiting the mature terminal/window stack.

### Fork iTerm2 and add native ZD UI

This provides ultimate control but imports iTerm2's large Objective-C/Swift codebase, build/signing/update system, and effective GPLv3 distribution obligations. Every upstream merge becomes product work. It is the opposite of using iTerm2 as a deep, stable dependency because there is no narrow embedding interface.

The Python API is powerful but not an arbitrary native plugin SDK. Its documented UI contributions are bounded: status components/popovers, context-menu items, titles, registered RPC/actions, and URL-backed toolbelt WebViews. A rich ZD editor can live in a web page; it cannot become a first-class native iTerm2 pane through the supported Python API.

## Candidate prototype architectures

### A. One hotkey window, one tab per project

Each tab contains terminal splits. A ZD Python daemon owns project IDs, tab variables/titles, initial working directories, and agent commands. `Cmd+1…9` changes project; the global hotkey hides the window.

This is the smallest useful experiment and directly tests the central interaction. ZD editing and graphs remain external or terminal-based.

### B. Mixed terminal + ZD browser pane per project

Each project tab contains terminals plus a browser-profile pane pointed at a ZD local web route such as `/projects/<id>`. The ZD page supplies the existing Markdown editor, goals, tasks, graphs, and agent status.

This most closely matches the desired integrated environment. It depends on the young optional browser plugin and must use ZD's own API for terminal-to-editor coordination because iTerm2 exposes no browser-specific Python control.

### C. Terminal tabs plus persistent ZD toolbelt

Keep terminals full-width and register ZD's web UI as a toolbelt WebView. When tab focus changes, the Python daemon updates ZD's selected project through the local service.

This is easier than mixed-pane orchestration and keeps ZD continuously visible, but a right-hand toolbelt is a constrained canvas for the full Markdown editor. It fits status, task selection, and agent steering better than long-form editing.

### D. Deep iTerm2 fork

Add native ZD views directly to iTerm2.

This should be rejected unless a throwaway prototype proves extraordinary value that cannot be obtained through the web/service boundary. License, upstream merge cost, and architectural coupling are all high.

## Fit matrix

Scores are relative to the workflow in `thoughts.txt`, where 5 is an unusually strong fit.

| Capability | Unmodified iTerm2 + ZD service | iTerm2 fork | Evidence and interpretation |
|---|---:|---:|---|
| Global summon/hide | 5 | 5 | Dedicated hotkey windows are a mature feature and can float over full-screen apps. |
| Follow current Space | 5 | 5 | Hotkey profile can use Current Space or All Spaces. |
| `Cmd+number` projects | 5 | 5 | Native indexed tab navigation is the default. |
| Multiple terminals per project | 5 | 5 | Sessions and split trees are core features. |
| Process/session continuity | 4 | 4 | Long-lived session servers and tmux integration are strong, with quit/reboot caveats. |
| ZD Markdown/code editor | 4 | 5 | A ZD web editor can use a browser pane/toolbelt; native integration requires a fork. |
| Goals/tasks/graphs/agent UI | 4 | 5 | Same web-host path; script APIs can coordinate project focus and status. |
| Browser in project layout | 4 | 5 | Shipping 3.6 capability, but plugin-dependent and still young. |
| Automation depth | 5 | 5 | Python API covers hierarchy, layout, events, variables, input, and extension hooks. |
| Arbitrary native extension UI | 2 | 5 | Supported script UI surface is narrow; a fork can do anything at large cost. |
| Terminal embedding into ZD | 1 | 1 | No documented embeddable iTerm2 terminal library. |
| License flexibility | 3 | 1 | Independent service/script boundary is clean; a distributed fork is effectively GPLv3. |
| Cross-platform product | 1 | 1 | iTerm2 is macOS-only. |
| Maturity | 5 | 5 | Long release history and current stable maintenance; browser subsystem is newer. |

## Pros

- The desired global hotkey/floating/auto-hide behavior already exists and is mature.
- Hotkey windows retain the normal tab/session model, and `Cmd+number` tab switching is standard behavior.
- Deep windows/tabs/splits/session functionality avoids rebuilding terminal layout and interaction.
- Python API is far more capable than simple command launchers; it can maintain explicit project metadata and react to focus/lifecycle events.
- Saved arrangements, dynamic profiles, Open Quickly, session restoration, and tmux control mode provide multiple levels of project/session persistence.
- Browser-profile panes are unusually well aligned with ZD's existing graphical/web-friendly editor and desired browser adjacency.
- WebView toolbelt registration offers a small, supported extension seam for project status and agent steering.
- Mature macOS integration and long production history reduce terminal-specific unknowns.
- An independent ZD localhost service keeps the core product portable and testable outside iTerm2.

## Cons

- macOS-only, which makes it a workflow host rather than a portable ZD platform.
- No embeddable terminal library for a future custom ZD app.
- No arbitrary native UI plugin SDK; the full ZD interface must be web-based, terminal-based, or maintained in a fork.
- Browser functionality needs a separate plugin and has no browser-specific Python API.
- Browser profiles are much newer than the terminal and should not be assigned the same maturity score.
- A deep fork is effectively GPLv3 and creates continuous upstream-merge/build/signing obligations.
- Python async daemons, iTerm2 variables, profiles, arrangements, ZD's service, and browser panes can become a distributed state system if ownership is not kept simple.
- Session restoration does not guarantee survival of an ordinary quit or reboot.
- tmux control-mode tabs cannot mix tmux and non-tmux panes, complicating browser/editor layouts.
- Accessibility, Automation/script permission, plugin installation, and local-service authentication all add onboarding and security surface.

## Risks and unknowns

The official documentation does not establish these points strongly enough; a prototype should answer them:

1. **Hotkey window composition:** Confirm that a dedicated floating hotkey window behaves correctly with several tabs and mixed terminal/browser split panes across Spaces and native full-screen apps.
2. **Focus return:** Verify that toggling the window returns focus to the previously active app reliably under the user's actual multi-Space workflow.
3. **Browser plugin provenance and lifecycle:** The install page supplies a downloadable component, but its source/license/update compatibility are not explained there. Determine how it is signed, updated, and version-matched before making it required.
4. **ZD editor compatibility:** Test clipboard, keyboard shortcuts, IME, drag/drop, local file workflows, downloads, WebSockets, service workers, devtools, and authentication inside the browser profile.
5. **Browser automation:** There is no browser-specific Python API. Confirm that a ZD localhost API can synchronize project selection without an undocumented JavaScript/native bridge.
6. **Toolbelt constraints:** Measure usable width, focus behavior, keyboard routing, reload behavior, and whether the WebView persists per window or globally.
7. **Tab identity durability:** Determine whether user variables and tab IDs survive arrangement restore, session restoration, app upgrade, and reboot. Keep ZD project IDs authoritative regardless.
8. **Arrangement semantics:** Test whether restoring an arrangement duplicates live agent processes, reconnects, or merely starts new commands. Make restore idempotent at the ZD layer.
9. **Session teardown:** Document what happens to each harness on tab close, window hide, app quit, crash, update, logout, and reboot.
10. **License boundary:** Get legal confirmation before distributing any modified iTerm2 or linked/bundled derivative. Prefer separate-process/web protocols.
11. **Shortcut conflicts:** Validate the chosen global hotkey and `Cmd+1…9` with browser form input, terminal TUIs, Secure Keyboard Entry, and the user's existing tools.

## Evidence-linked verdict

iTerm2's official [hotkey documentation](https://iterm2.com/documentation-hotkey.html), [numbered tab navigation](https://iterm2.com/documentation-preferences-keys.html), [Python API](https://iterm2.com/python-api/), [arrangements](https://iterm2.com/python-api/arrangement.html), and [browser-session hierarchy](https://iterm2.com/documentation-web.html) jointly cover more of the requested interaction than any ordinary terminal emulator. The [WebView tool API](https://iterm2.com/python-api/tool.html) also provides a narrower path to mount ZD without forking.

Recommendation:

1. **Run a time-boxed iTerm2 host prototype.** Use one dedicated floating hotkey window, one numbered tab per ZD project, and ordinary terminal splits first.
2. **Keep ZD authoritative.** A small Python adapter maps ZD project IDs to iTerm2 objects and calls a local ZD API. iTerm2 arrangements and variables are projections/cache, not the source of truth.
3. **Test two graphical placements:** a browser-profile split for full editing and a toolbelt WebView for steering/status. Choose based on real keyboard/focus/layout behavior.
4. **Do not fork iTerm2 for the initial direction.** The separate-process boundary captures most of the value while avoiding effective-GPLv3 coupling and upstream maintenance.
5. **Do not assume iTerm2 is the final product shell.** If the prototype validates the interaction, reproduce the proven model in custom ZD later with an embeddable terminal library.

iTerm2 is thus the best **learning vehicle and interim shell**, not necessarily the best permanent architectural owner of ZD.

## Primary sources

- [iTerm2 documentation, version 3.6](https://iterm2.com/documentation.html)
- [Official downloads and stable release history](https://iterm2.com/downloads.html)
- [Official news archive](https://iterm2.com/news.html)
- [Hotkeys](https://iterm2.com/documentation-hotkey.html)
- [Window profile and Spaces behavior](https://iterm2.com/documentation-preferences-profiles-window.html)
- [General window/tab/split usage](https://iterm2.com/documentation-general-usage.html)
- [Key and numbered navigation settings](https://iterm2.com/documentation-preferences-keys.html)
- [Appearance and tab-number settings](https://iterm2.com/documentation-preferences-appearance.html)
- [Session restoration](https://iterm2.com/documentation-restoration.html)
- [tmux integration](https://iterm2.com/documentation-tmux-integration.html)
- [Dynamic Profiles](https://iterm2.com/documentation-dynamic-profiles.html)
- [Python API](https://iterm2.com/python-api/)
- [Scripting fundamentals](https://iterm2.com/documentation-scripting-fundamentals.html)
- [Arrangement API](https://iterm2.com/python-api/arrangement.html)
- [Tool/WebView API](https://iterm2.com/python-api/tool.html)
- [Running scripts and security prompts](https://iterm2.com/python-api/tutorial/running.html)
- [Web Browser](https://iterm2.com/documentation-web.html)
- [Browser Plugin](https://iterm2.com/browser-plugin.html)
- [Official repository](https://github.com/gnachman/iTerm2)
- [License](https://github.com/gnachman/iTerm2/blob/master/LICENSE) and [effective-license note](https://github.com/gnachman/iTerm2/blob/master/COPYING)

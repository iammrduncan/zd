# Browser integration directions

Research date: 2026-08-11

## The requirement is ambiguous

“Browser integration” could mean at least four different things:

1. open an external link without losing the ZD context;
2. keep documentation or localhost preview beside an editor/terminal;
3. inspect and automate a development page;
4. become a general authenticated browser with tabs, downloads, password managers, and extensions.

Only the first two are clearly supported by `thoughts.txt`. The fourth is a separate browser
product and should be rejected unless daily use proves it essential.

## Option A: system-browser handoff

ZD opens web links in the default browser and may remember the association with a project.

### Pros

- Minimal implementation and attack surface.
- Keeps passwords, extensions, downloads, profiles, and privacy controls in a real browser.
- Already aligns with ZD's documented external-link boundary.

### Cons

- Preserves the context switching the note wants to reduce.
- Cannot place the page in the same project workspace.
- Limited steering or inspection integration.

## Option B: restricted preview webview

ZD creates a separate webview for a local development URL or trusted documentation, with navigation
controls and an explicit “Open in browser” escape hatch. Tauri's webview API supports remote URLs,
multiple webviews, navigation, incognito mode, JavaScript disabling, and per-view data-store options
with platform qualifications.

Source: [Tauri webview API](https://v2.tauri.app/reference/javascript/api/namespacewebview/)

### Pros

- Keeps editor, terminal, and preview inside a project layout.
- Uses the current system webview rather than shipping a browser engine.
- A local preview is the high-value development case.
- Can be a narrow mini app instead of a browser product.

### Cons

- Authentication, popups, downloads, certificates, permissions, media, WebAuthn, and navigation
  policies become ZD concerns as soon as arbitrary browsing is allowed.
- System webviews differ by OS.
- Some sites deny embedding or behave differently from a full browser.
- Increases memory and lifecycle complexity per project.

## Option C: browser extension or debugging-protocol companion

A small Chrome/Safari/Firefox extension or devtools-protocol adapter links the active page back to a
ZD project while the page remains in a real browser.

### Pros

- Retains the user's existing profiles, extensions, credentials, and full browser capability.
- Can capture URL/context, open source locations, and connect test/agent workflows.
- Avoids rendering the open web inside a privileged local app.

### Cons

- Requires browser-specific packaging, permissions, and updates.
- Still uses a separate window.
- Deep automation introduces a powerful security boundary and browser-version coupling.
- Safari distribution and permission behavior differ from Chromium.

## Security boundary that must not be crossed

Remote pages must never inherit ZD's filesystem, shell, PTY, agent, or todo permissions. Tauri's
capability system can target exact webview labels, and a webview with no matching capability has no
IPC access. Tauri specifically warns about granting remote sources local system access and notes
that combining capabilities merges their permissions.

Sources:

- [Tauri capability reference](https://v2.tauri.app/reference/acl/capability/)
- [Tauri capabilities guide](https://v2.tauri.app/security/capabilities/)
- [Tauri Content Security Policy guide](https://v2.tauri.app/security/csp/)

The architectural rule should be stronger than “be careful”:

> A browser webview is untrusted and has zero ZD IPC capabilities. It communicates only through a
> tiny ZD-owned navigation/controller channel that validates every message outside the page's
> JavaScript context.

The terminal is also too privileged to share a scripting context with arbitrary remote content.

## Recommendation

Start with a project-scoped **preview**, not a browser:

- one URL per project tab;
- local HTTP(S) and an explicit trusted-host allowlist first;
- back, forward, reload, address display, and “Open in default browser”;
- zero native IPC capability in the remote view;
- no password manager, downloads, extensions, or general browsing promises;
- destroy or suspend it according to a measured project-lifecycle policy.

If the real pain is page-to-project context rather than co-location, prototype a browser companion
later. Do not expand the preview into a general browser by accident.

## Evidence gaps

- The user's most frequent browser tasks and whether they require authenticated profiles are not
  yet observed.
- System-webview behavior for target development sites has not been tested.
- Memory cost for several project previews needs measurement.
- Browser automation is not yet a stated acceptance requirement.

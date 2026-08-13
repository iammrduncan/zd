# Goal 01 summary: Trustworthy verification

## Outcome

The automated suite now observes the product state named by its assertions. Root-route coverage
proves the styled `zd md` surface booted, editor tests materialize exact virtualized constructs,
focus and motion tests settle on asserted state, and unit preferences run with isolated browser
storage.

## Source todos closed

- **WU-003:** The `/` browser test asserts the `zd md` title, product-owned surface, no-document
  notice, canvas token, full-window geometry, and prose face. Twenty repeated root-suite runs passed
  60/60 tests without retries, closing the intermittent blank-page report with a repeatable
  diagnostic rather than an unobserved visibility proxy.
- **WU-004:** Rendering, range, caret, and raw-mode specs now locate semantic classes plus unique
  fixture text and assert the intended visible or computed result. The audit exposed and the fix
  covered a real later-H1 spacing defect that oversized viewports had hidden.
- **WU-010:** Editor selectors are scoped to product-owned hosts or semantic classes. A repository
  test rejects ambiguous bare rendered-element selectors.
- **WU-011:** `materializeEditorTarget` owns real surface scrolling and waits for CodeMirror
  materialization plus parse/decorations before returning the exact target.
- **WU-012:** Whole-document sweeps remain only where the claim needs every position or construct;
  caret and rendering controls use named representative semantic positions elsewhere.
- **WU-013:** Focus, edge-return, block-jump, scroll-easing, and typewriter tests poll selection,
  caret, animation, scroll, or painted-target state. The repository audit rejects fixed delays and
  fixed frame-counting in those specs.
- **WU-014:** jsdom has a valid origin, preference tests prove working storage methods, and global
  setup clears local and session storage before and after every unit test.

## Verification

- Complete editor plus root-route browser suite: **256 passed**, zero retries.
- Bottom-edge caret-return stress diagnostic: **20 passed** across ten repetitions.
- Root-route stress diagnostic: **60 passed** across twenty repetitions.
- `npm run check`: passed **three consecutive times**; each run reported **405 passed**, **5
  intentionally skipped**, with typecheck, lint, and version synchronization green.
- Repository guards cover oversized editor viewports, ambiguous selectors, fixed focus/motion
  timing, valid documentation links, and the bounded multi-todo goal contract.

## Commits

- `f25a8eb` — Harden unit storage harness
- `7cfa9fa` — Fix virtualized heading spacing
- `dff4eff` — Materialize rendered editor fixtures
- `18e3224` — Trust editor browser assertions
- `d5f1142` — Guard trustworthy verification
- `bff21ab` — Align checks with objective docs

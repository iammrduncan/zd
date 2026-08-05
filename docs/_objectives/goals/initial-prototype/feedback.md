# Initial prototype — user review feedback

Recorded 2026-07-28 during hands-on source testing on a second Mac. Every item
below is an acceptance blocker for the initial-prototype goal. An item is done
only when its behavior is expressed in canonical BDD, covered by a red-first
regression or design test, implemented in the production app, and verified in
the rebuilt native app where visual or platform behavior is involved.

## Open findings

### F01 — Links leave the reader

Links open a browser instead of opening the linked document in the reader.
Workspace-relative document links must navigate inside `zd md`; only genuinely
external web links should cross into the system browser.

Coverage audit (2026-07-28): `REQ-READ-06`; “A relative link to another markdown Document
navigates inside `zd md`” (`@F01`); regressions
`only_http_links_may_leave_the_process` and
`rendered_link_has_distinct_keyboard_focus_and_enter_activation`; implementation checkpoint
`7bc3496`. Native second-Mac reviewer sign-off is not recorded.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F02 — Shortcut Reference is blank

Pressing `cmd+.` makes the entire window go blank and shows no shortcuts.
`cmd+.` must show the complete Shortcut Reference over the current context, and
pressing it again must restore that context unchanged.

Coverage audit (2026-07-28): `REQ-PLAT-22`; “The Shortcut Reference key uses the platform
logical modifier” (`@F02`); regression
`shortcut_reference_opens_and_closes_with_the_same_command`; implementation checkpoints
`d941116` and `7bc3496`. A static screenshot cannot prove the open/close round trip preserves
context, and no second-Mac reviewer sign-off is recorded.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F03 — Word Wrap control and shortcut

Word Wrap needs an explicit enabled/disabled setting and a keyboard shortcut.
The setting, command, visible Shortcut Reference, and persistence behavior must
all agree.

Coverage audit (2026-07-28): `REQ-THEME-30`; “The Word Wrap shortcut changes the open editor
immediately” (`@F03`), plus its settings and persistence scenarios; regressions
`command_option_z_consumes_the_composed_text_event_before_the_editor_sees_it` and
`word_wrap_has_a_discoverable_editor_shortcut`; implementation checkpoint `7bc3496`.
Existing settings/shortcut images are candidate evidence only, not recorded reviewer sign-off.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F04 — Focus reader behavior is absent

The core focused-reading behavior is not visibly working. The section currently
being read must remain at full contrast while the surrounding content is
visibly dimmed, with keyboard and pointer/scroll movement updating the Focus
Target.

Coverage audit (2026-07-28): `REQ-FOCUS-01` through `REQ-FOCUS-20`; “Content outside the Focus
Target is dimmed rather than hidden” (`@F04`) and the production focus-driver scenarios;
regressions `default_focus_dim_is_immediately_visible`,
`shaped_reading_focus_targets_one_real_proportional_visual_row`, and
`incoming_focus_is_immediate_while_outgoing_focus_eases`; implementation checkpoint `7bc3496`.
`evidence/native-macos/14-reading-focus-0-dark.jpeg`,
`15-reading-focus-100-dark.jpeg`, and `18-fixture-reading-focus-100-dark.jpeg` are candidate
artifacts, but the required reviewer sign-off is not recorded.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F05 — Markdown Editing typography is difficult to read

Markdown Editing Mode has visibly unaligned bullet and number markers, special
characters, ligatures, and related source glyphs. The result is extremely hard
to read. Source markers must form a deliberate, aligned editing texture without
breaking the prose rhythm.

Coverage audit (2026-07-28): `REQ-MDEDIT-01` and `REQ-MDEDIT-17`; “Markdown source typography
preserves structure without breaking prose rhythm” (`@F05`); regressions
`markdown_editor_keeps_source_markers_and_assigns_semantic_type_roles` and
`markdown_list_markers_nesting_and_continuations_share_fixed_geometry`; implementation
checkpoint `7bc3496`. The markdown-editor screenshots are candidate artifacts without recorded
reviewer sign-off.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F06 — Intraword underscores are misread as formatting

For a name such as `HEADING_SENTINEL_01-rollout-plan`, Reading Mode is correct,
but Markdown Editing Mode styles the underscore-delimited text as formatting.
Underscores that are part of an identifier or name must remain literal source,
not emphasis.

Coverage audit (2026-07-28): the shared `@F06` Markdown source typography scenario; regression
`markdown_editor_keeps_intraword_identifier_underscores_literal`; implementation checkpoint
`7bc3496`. No rebuilt-native reviewer sign-off is recorded.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F07 — Inline code is off the text baseline

Text inside single backticks is visibly unaligned with the surrounding prose.
Inline code must share the surrounding baseline and line rhythm while retaining
a restrained semantic distinction.

Coverage audit (2026-07-28): the shared `@F07` Markdown source typography scenario; regression
`inline_code_inherits_body_and_heading_metrics`; implementation checkpoint `7bc3496`. No
rebuilt-native reviewer sign-off is recorded.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F08 — Fenced code blocks render like malformed inline code

Multiline fenced code blocks do not form coherent code sections. They look like
formatted inline-code fences. A fenced block must render as a distinct,
readable code passage and use language-appropriate syntax highlighting when a
language is declared.

Coverage audit (2026-07-28): the shared `@F08` Markdown source typography scenario; regressions
`markdown_editor_fenced_rust_block_is_coherent_and_highlighted` and
`rendered_fenced_plane_shares_the_markdown_source_origin`; implementation checkpoint `7bc3496`.
No rebuilt-native reviewer sign-off is recorded.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F09 — Bullet size does not match the prose

The bullet glyph is not proportioned appropriately for the surrounding text.
Its size, weight, baseline, and indentation must feel native to the prose size.

Coverage audit (2026-07-28): `REQ-READ-04` and `REQ-READ-15`; “Reading lists expose their
hierarchy through proportion alignment and rhythm” (`@F09`); regressions
`reading_list_markers_have_deliberate_proportion_and_hierarchy` and
`reading_ordered_list_soft_wraps_return_to_the_item_text_origin`; implementation checkpoint
`7bc3496`. No rebuilt-native reviewer sign-off is recorded.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F10 — Inline code inside headings is visually broken

Single-backtick code inside a heading does not sit comfortably with the
surrounding heading. It should retain the heading's size and baseline, with only
a restrained code distinction rather than dropping to body inline-code size.

Coverage audit (2026-07-28): the shared `@F10` Markdown source typography scenario; regression
`inline_code_inherits_body_and_heading_metrics`; implementation checkpoint `7bc3496`. No
rebuilt-native reviewer sign-off is recorded.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F11 — Column Split shortcuts conflict with macOS

`cmd+|` invokes or collides with an unrelated macOS/1Password action. Replace
the Column Split commands with:

- `cmd+[` — remove a Column Split.
- `cmd+]` — add a Column Split.

Any existing commands on those bindings must be remapped or left reachable by
name so the registry contains no hidden collision.

Coverage audit (2026-07-28): `REQ-SPLIT-02`, `REQ-SPLIT-03`, and `REQ-SPLIT-04`; “The Column
Split keys step the count by one” (`@F11`); regression
`shortcut_reference_reserves_brackets_for_column_splits`; implementation checkpoint `7bc3496`.
The split screenshots are candidate artifacts without recorded reviewer sign-off.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F12 — Page hierarchy and ordered lists are unclear

The typographic hierarchy is too weak in real documents. In
`docs/goals/initial-prototype/goal.md`, for example, an ordered list reads like
a blob of left-aligned text that merely happens to begin with numbers. Headings,
ordered markers, indentation, continuation lines, and vertical rhythm must make
the document structure immediately legible without adding decorative chrome.

Coverage audit (2026-07-28): `REQ-MDEDIT-01`, `REQ-MDEDIT-17`, `REQ-READ-04`, and
`REQ-READ-15`; the `@F12` Markdown source typography and Reading list hierarchy scenarios;
regressions `markdown_list_markers_nesting_and_continuations_share_fixed_geometry` and
`reading_ordered_list_soft_wraps_return_to_the_item_text_origin`; implementation checkpoint
`7bc3496`. No rebuilt-native reviewer sign-off is recorded.

Status: open — automated coverage exists; rebuilt-native verification is still required.

### F13 — Quick Open flashes while typing

The window visibly flashes as text is entered into Quick Open. Querying and
progressive result replacement must preserve one stable transient plane, size,
typographic composition, and backdrop; typing may update text and results but
must never expose a blank frame, reorder paint layers, or flash the underlying
Document.

Coverage audit (2026-07-28): `REQ-QOPEN-12`; “Typing keeps one stable Quick Open plane while
replacement results are prepared” (`@F13`, `@F17`, `@F18`), which captures settled, input, and
pending frames from the production UI; regressions
`quick_open_submits_the_typed_query_on_its_input_frame` and
`quick_open_never_presents_a_loading_only_frame_between_queries`; implementation checkpoint
`f80e85b`. `evidence/native-macos/08-quick-open.jpeg` is a static candidate artifact and cannot
prove absence of flashing while typing.

Status: open — automated frame coverage exists; rebuilt-native motion verification is still
required.

### F14 — The feedback ledger is not being closed

Implemented work has not been reconciled back into this file, leaving every
finding marked open and making the claimed evidence impossible to audit. Every
feedback item must be closed in place with its canonical BDD scenarios,
production-path regression and design tests, implementation commit, and native
evidence where applicable.

Coverage audit (2026-07-28): this is a completion-ledger obligation, not a separate
user-facing product requirement, so it deliberately has no invented `REQ-*` ID. The records
above and below now name their scenarios, regressions, implementation checkpoints where known,
and candidate/native-evidence gaps. None is closed merely because a scenario exists.

Status: open — coverage is reconciled, but completion reconciliation remains unfinished until
the findings themselves close.

### F15 — Shortcut Reference typography is cramped

The Shortcut Reference compresses the key labels into an ugly, hard-to-scan
column and requires excessive scrolling. It should read like a compact rendered
Markdown table: hotkeys in restrained single-backtick-style inline code,
descriptions in prose, consistent row rhythm, sufficient column measure, and a
dense layout that presents the registry with minimal scrolling.

Coverage audit (2026-07-28): `REQ-PLAT-23`; “Shortcut Reference typography stays compact
legible and unclipped” (`@F15`, `@F17`, `@F18`) renders the production surface at 1080 px and
720 px; design regression
`shortcut_reference_keeps_two_typographic_columns_at_supported_widths`; implementation
checkpoint `f80e85b` plus current uncommitted compact-layout work. Shortcut screenshots are
candidate artifacts; rebuilt-native reviewer sign-off is not recorded. The focused design test
enforces one aligned key column and one aligned action column; a two-pane/two-up table does not
satisfy this contract even if each pane is internally aligned.

Status: open — focused production and design regressions pass; rebuilt-native verification is
still required.

### F16 — Displayed shortcuts do not all execute

Many shortcuts shown in the Shortcut Reference appear to do nothing. Every
displayed binding must dispatch through the real production keyboard path to
its named command in every context where that command is shown as available.
Unavailable commands must be identified honestly rather than displayed as
working shortcuts.

Coverage audit (2026-07-28): `REQ-PLAT-24`; “Every displayed available shortcut executes its
named production command” (`@F16`, `@F17`, `@F18`) reads the painted availability, dismisses the
modal Reference without changing its underlying context, and then sends each available chord
through the production keyboard dispatcher across Home, Reading, Markdown Editing, Code
Editing, ordinary Workspace, Git Workspace, and Sidebar-keyboard contexts. Its production
matrix and deep regression are current uncommitted work; no implementation commit or native
verification is recorded yet. The focused Cucumber scenario and
`shortcut_registry_dispatches_through_production_events_with_context_truth` both pass.

Status: open — focused production coverage passes; implementation commit and rebuilt-native
verification are still required.

### F17 — Tests and evidence miss basic shipped behavior

The current evidence can report success while basic native functionality is
still absent or broken. Model-only adapters cannot stand in for production UI
behavior. Critical user paths must be exercised through the production app
state and keyboard/rendering dispatch, and visual claims must be checked in the
rebuilt native app by the required reviewers.

Coverage audit (2026-07-28): this is an acceptance-evidence policy, not a new product behavior,
so it deliberately has no invented `REQ-*` ID. The `@F17` scenarios for F13, F15, and F16 are
specified against `UiHarness` production app state/rendering/dispatch rather than a model-only
adapter. F13 passes its focused production regressions and F15 passes its single-table production
and design regressions; F16 passes its seven-context production dispatch matrix. Static native
images remain insufficient for temporal or keyboard claims.

Status: open — native reviewer evidence is still incomplete.

### F18 — Unit and design coverage is incomplete

BDD is the outer acceptance specification, not the only test layer. Every bug
fix needs a red-first unit or production integration regression at the deepest
useful boundary, and visual-system changes need design-contract coverage in
addition to their Cucumber scenario. The completion record must name those
tests explicitly.

Coverage audit (2026-07-28): this is a test-layer policy, not a new product behavior, so it
deliberately has no invented `REQ-*` ID. The `@F18` scenarios name their deepest production
regressions above; visual F15 additionally names its design-contract test, and F16 names
`shortcut_registry_dispatches_through_production_events_with_context_truth`. A finding may close
only after its record names the red-first regression and, for visual changes, the design test.

Status: open — the historic F01–F12 red-first/design provenance still needs completion review;
the new F13/F15/F16 layered regressions pass.

## Completion record

Update each finding's status in place with its canonical scenario IDs,
regression/design tests, implementation commit, and native evidence path.
Do not remove or renumber findings after they are fixed.

# Zen Suite Design System

Status: **canonical and binding**

Applies to: the `zd` suite shell and every current and future miniapp

Initial implementation: `zd md`

## 1. Authority

This document is the visual and interaction design contract for Zen Suite. It replaces the
earlier concept draft and has no unresolved design questions.

The sources have distinct authority:

1. [`docs/VISION.md`](VISION.md) defines observable `zd md` behavior
   and product scope.
2. This document defines how that behavior looks, feels, and composes across the suite.
3. Accepted [`docs/adr/`](adr/README.md) records define the TypeScript, CodeMirror, Tauri, and
   native-authority boundaries.
4. Automated tests record the behavior that the current implementation can prove.

If a screen conforms to this document but fails its relevant behavior or rendering tests, it is
not finished. If it passes a test by adding visual noise forbidden here, it is not finished.

## 2. Product character

Zen Suite is a quiet place for doing one thing at a time. Its interface should recede until
content, language, and the user's present action are all that remain.

The restraint of iA Writer and OmmWriter is an influence, not a skin to copy. We adopt their
confidence in typography, generous silence, and uninterrupted concentration. We do not copy
their branding, ornament, simulated paper, ambient decoration, or platform-specific mannerisms.

The intended feeling is:

- calm, not empty;
- elegant, not precious;
- warm, not tinted for effect;
- precise, not technical-looking;
- fast enough that the interface appears to anticipate the user;
- consistent enough that learning one miniapp teaches the rest.

The product is never a dashboard, IDE, productivity cockpit, or collection of panels.

## 3. Non-negotiable principles

### Content is the interface

At rest, the primary content surface is the application. A miniapp may add one compact
navigation surface when its task genuinely requires it. Everything else is summoned, used, and
dismissed.

### Text before controls

Actions are words. Selection is expressed through type, position, a hairline, or a quiet change
of surface. There are no boxed buttons, pills, icon tiles, floating action buttons, segmented
controls, or decorative control containers.

Text actions still have generous invisible hit areas and complete keyboard semantics. “No box”
never means “small target” or “unlabelled control.”

### Chrome is absent

No miniapp supplies an application bar, toolbar, tab strip, control strip, persistent status
bar, custom title bar, decorative header, branded footer, or ornamental scrollbar. Native window
controls may remain where the operating system requires them; the suite draws no substitute.

On macOS, content uses the full-size window plane behind the native traffic-light controls. The
native titlebar plane, title text, and separator are hidden. No Home, Document, Workspace, or
transient surface opens a second titled window.

On Windows, the native caption and decorated titlebar are disabled for every root and secondary
application viewport. Operating-system-owned file and folder pickers are outside this application
chrome contract: `zd` does not draw or restyle their native frame.

No application-provided window title is painted into the content area. No control is kept on
screen merely to advertise that a feature exists.

### Hierarchy comes from typography and space

Use scale, weight, rhythm, indentation, and alignment. Do not use cards, shadows, gradients,
glass, textures, gratuitous rules, or large tinted containers to manufacture hierarchy.

### Geometry is stable

Opening a transient surface, changing mode, applying focus, refreshing Git state, or receiving a
filesystem update must not make unrelated content jump. Reflow preserves the semantic viewport
anchor defined in the vision and implemented by the document surface.

### Local-first is visible in the behavior, not in decoration

There are no cloud badges, sync indicators, account avatars, telemetry prompts, or network
states. Remote images are blocked and agent-generated markup is untrusted. Notices are plain,
specific text placed near the affected content.

## 4. One suite, one visual system

### 4.1 Ownership

The suite shell owns one persisted `Settings` value and resolves one `DesignSystem` from it for
each frame. (`SuiteAppearance` is the design-policy module that owns the closed ranges and
defaults used by both.) Every miniapp receives that resolved `DesignSystem`; no miniapp creates
or forks a theme.

```text
Settings (suite-owned, persisted once)
├── theme choice: System | Light | Dark
├── warmth: 6500 K … 2700 K
├── prose size
├── code size
├── heading scale
├── focus dim level
├── focus granularity
└── shared behavior preferences
            │
            ▼
DesignSystem::resolve
├── semantic colour roles
├── typography roles
├── spacing and measure
├── line, focus, and selection treatments
└── motion and accessibility policy
            │
            ▼
suite shell + every miniapp + every transient surface
```

Changing Theme or warmth in any miniapp updates the shared suite preference and changes every
open miniapp and suite-owned surface. Newly opened miniapps inherit it. System Theme follows the
operating system live; an explicit Light or Dark choice ignores later OS appearance changes.
Warmth is always manual and independent of OS night mode.

The first prototype contains only `zd md`, but the boundary is suite-owned now. A future
miniapp may add semantic roles only when its content has a meaning not represented here. It may
not add a private palette, private font scale, or “temporary” visual constants.

### 4.2 Token rule

Miniapp rendering code may use semantic tokens such as `surface.canvas`,
`text.secondary`, or `state.changed`. It must not contain:

- raw RGB, RGBA, HSL, or named colour values;
- raw font family names, sizes, weights, or line heights;
- private corner radii, shadows, border styles, or animation timings;
- duplicated spacing or width constants already represented by suite tokens;
- theme-name conditionals such as `if dark { … }` in a miniapp.

Literal values exist only in the suite theme/style definitions. Content measurements derived
from the document, viewport, font metrics, or platform scale are not visual literals and remain
the responsibility of the owning deep module.

### 4.3 Semantic colour roles

The shipped set is closed: **System**, **Light**, and **Dark**. System resolves to Light or Dark,
so there are two palettes, not three subtly different appearances.

| Role | Light | Dark | Meaning |
| --- | --- | --- | --- |
| `surface.canvas` | `#FAFAF7` | `#191A19` | Primary content plane |
| `surface.sidebar` | `#F3F3EF` | `#20211F` | Optional navigation plane |
| `surface.transient` | `#F7F7F3` | `#222320` | Quick Open, settings, find, command list |
| `surface.selection` | `#E7E8E2` | `#30322E` | Selected row or selected text support |
| `surface.code` | `#F0F1EC` | `#242622` | Inline and fenced code |
| `text.primary` | `#242522` | `#E5E2D9` | Prose and active content |
| `text.secondary` | `#5F625C` | `#B4B1A9` | Navigation and supporting content |
| `text.muted` | `#4A4E48` | `#B4B5AE` | Syntax markers and quiet metadata |
| `text.link` | `#284C5B` | `#A8CCD8` | Activatable links |
| `line.quiet` | `#DCDDD7` | `#353733` | Dividers, rules, quote lines |
| `line.focus` | `#506F78` | `#86A9B2` | Keyboard focus and current-row hairline |
| `state.added` | `#2D5338` | `#A6CFB1` | Git addition, always paired with `A` |
| `state.changed` | `#85682C` | `#D1B36C` | Git change/conflict, paired with `M` |
| `state.deleted` | `#8A4D4A` | `#D99993` | Git deletion, paired with `D` |
| `state.error` | `#854943` | `#DB938B` | Inline refusal or failure |

These values are canonical theme inputs. The implemented colour pipeline must measure the final
rendered output, including warmth and focus dimming:

- body prose contrast remains between 7:1 and 15:1;
- ordinary controls, navigation text, status glyphs, and focus indicators meet WCAG 2.2 AA;
- pure black on pure white and pure white on pure black are forbidden;
- no state is communicated by colour alone;
- syntax remains distinguishable at the warmest setting and without colour.

Warmth is a colour-space transform over resolved semantic colours and local images, not a
translucent orange overlay. The prototype converts sRGB roles to linear light, interpolates from
identity to a restrained warm-white channel adaptation at 2700 K, then encodes sRGB again. This
preserves luminance relationships better than multiplying gamma-encoded channels and avoids an
orange veil. At 6500 K the transform is an exact identity operation. At 2700 K it must retain the
contrast and state distinctions above. A round trip to neutral restores the exact unwarmed
colours.

### 4.4 Focus derivation

Focus Mode is on by default with a 65% Dim Level and paragraph granularity. Native review of the
earlier 35% proposal found it too subtle to make the central reading behavior unmistakable. It
uses two derived
roles:

- `focus.target`: the normal semantic rendering of the target;
- `focus.context`: the same semantic roles moved toward their owning surface by the current Dim
  Level, never hidden.

**Context is deliberately below the usual readability floor** (decided 2026-07-29, after the
complaint was raised four times). It is meant to be barely legible: at the 90% default it sits
near 2:1 against the canvas and at 100% near 1.7:1, against a target of roughly 14.7:1. Drawing
the eye to one passage is this product's central behaviour, and a context that stays comfortably
readable does not do it. This is an accessibility trade made knowingly by the reader it affects;
it is not a defect, and raising those ratios needs a fresh decision rather than a fix.

Dim Level is continuous from 0% to 100%. Zero means no dimming and replaces a separate Focus
Mode toggle. The Theme maps 100% to a palette-specific derived endpoint; it is
never literal opacity, transparency, or a blend all the way into the canvas — context keeps a
colour of its own, so the shape of the document is never lost. Focus changes do
not alter layout, font weight, source, selection, or caret position.

### 4.5 Product icon

The application icon is the sole product mark and the only icon tile outside the runtime
interface. It uses the canonical flat paper and ink colours: a `surface.canvas` superellipse with
true transparent outer corners and a centred lowercase `zd` in the shipped iA Writer Quattro
Bold face. The mark preserves that face's authentic unkerned pair advances; logo-specific
tracking, forced ligatures, and reshaped letterforms are forbidden.
The wordmark occupies 480 of the 1024 master pixels. There is no gradient, texture, border,
shadow, highlight, alternate typeface, or decorative symbol.

`packaging/macos/render-icon.swift` is the deterministic source; generated platform assets must
be derived from its 1024 px output. Review the actual 16, 32, 128, and 1024 px rasters. A mark
that is elegant only at master size fails.

## 5. Typography

Typography carries nearly the whole interface. It must be treated as product behavior, not final
polish.

### 5.1 Families

The suite bundles two open, local typeface families:

- **iA Writer Quattro** for prose, headings, actions, supporting text, and general interface text;
- **iA Writer Mono** for the Sidebar, file paths, Markdown markers, inline code, fenced code, and
  code files.

iA Writer Quattro includes the upright Regular, drawn Italic, and upright Bold faces used by prose
and heading roles. iA Writer Mono supplies the upright Regular face required by its source and
navigation roles. This split is suite-wide: a miniapp may select a semantic type role, but it may
not substitute a local family. Changing either family in `DesignSystem` changes every consumer.
Fonts are never fetched. Missing glyphs fall through the platform chain, including colour emoji
and CJK. If a bundled family cannot load, the platform's legible sans or monospace fallback is
used and a non-blocking notice names the failure.

Fallback shaping applies to every styled Reading role—headings, links, emphasis, strong text,
inline code, and fenced code—and to visible Markdown and code editing text. It preserves the
owning role's family class, size, line height, weight, style, and semantic colour while the
platform supplies only the missing glyph. A fallback path that avoids tofu by flattening a
styled passage to one prose role is non-conforming.

The shipped-face manifest is exact:

- `iAWriterQuattroV.ttf`: variable upright face at the Regular default for prose and interface text, preserving its full shaping tables;
- `iAWriterQuattroV-Italic.ttf`: variable drawn Italic for emphasis, preserving its full shaping tables;
- `iAWriterQuattroS-Bold.ttf`: upright Bold for headings, list markers, and selected values;
- `iAWriterMonoS-Regular.ttf`: upright Regular for the Sidebar, file paths, Markdown markers,
  inline code—including inline code inside Bold headings—fenced code, and code files.

All four unmodified faces are pinned to the official `iaolo/iA-Fonts` revision recorded in
`iAWriter-SOURCE.md` and distributed under the bundled `iAWriter-OFL.txt` SIL Open Font License
1.1. “iA Writer” and “Plex” remain Reserved Font Names.

The upstream static Bold face carries an OS/2 weight value of 400 despite its Bold outlines and
name. Font loaders select that exact face through the suite's semantic Bold alias; they must not
substitute the Regular face, infer weight from the incorrect field, modify the font bytes, or
synthesize a stroke. Regular and Italic fallback shaping selects the Quattro variable family,
Bold selects the static Bold family, and literal-source roles select Writer Mono. Missing-glyph
detection evaluates the cmap of the face assigned to each run instead of assuming the Regular
prose face represents every role.

Synthetic bold, synthetic italic, faux oblique, and stroke-expanded text are forbidden. A role
that requires a face not present in this manifest must fall back honestly rather than synthesize
it. Strong containing emphasis resolves to the shipped upright Bold face: strong wins, the nested
run is not italic, and the suite does not introduce a separate Bold Italic role.

iA Writer Quattro preserves the calm, typewriter-derived character of the product references
without forcing prose onto a rigid grid. Its four-width construction, open forms, drawn italic,
and distinguishable `I`, `l`, `1`, `O`, and `0` support long sessions and low-density screens.
iA Writer Mono turns file hierarchy and literal source into a precise secondary texture. The
family change must not change semantic size, line-height, measure, or colour tokens.

The shipped iA Writer Quattro variable faces retain the shaping data required by the executable
`appearance.feature` contracts. Their duospace rhythm deliberately omits kerning and standard
ligatures; the production shaper must preserve those pair advances rather than inventing
substitutions. Canonical composition and combining-mark positioning remain active, and the
bundled alternate-glyph tables remain intact. The prototype exposes no OpenType feature controls
and no per-mode font picker.

### 5.2 Type roles

All values below are logical pixels at 1× before OS scaling. The operating system's default text
size is applied on first launch.

| Role | Family | Size / line | Weight | Use |
| --- | --- | ---: | ---: | --- |
| `type.prose` | iA Writer Quattro | 17 / 28 | Regular | Paragraphs and long-form reading |
| `type.prose-emphasis` | iA Writer Quattro | 17 / 28 | Italic | Emphasis and quotations |
| `type.h1` | iA Writer Quattro | 30 / 38 | Bold | Document title-level heading |
| `type.h2` | iA Writer Quattro | 24 / 32 | Bold | Major section |
| `type.h3` | iA Writer Quattro | 22 / 31.9 | Bold | Subsection |
| `type.h4` | iA Writer Quattro | 20 / 29.5 | Bold | Fourth-level hierarchy |
| `type.h5` | iA Writer Quattro | 18 / 27.5 | Bold | Restrained fifth-level hierarchy |
| `type.h6` | iA Writer Quattro | 16 / 25.4 | Bold | Smallest heading; compact but distinguished by weight |
| `type.code` | iA Writer Mono | 14 / 22 | Regular | Code editor and fenced blocks |
| `type.inline-code` | iA Writer Mono | 15 / 24 | Regular | Inline source |
| `type.navigation` | iA Writer Mono | 12.5 / 22 | Regular | Paths and Sidebar rows |
| `type.supporting` | iA Writer Quattro | 13 / 20 | Regular | Notices, hints, transient status |
| `type.action` | iA Writer Quattro | 15 / 24 | Regular | Text actions and settings labels |

H3–H6 use the stepped 22 / 20 / 18 / 16 size ladder alongside their stepped space above
(decided 2026-08-03). Type and space reinforce the same hierarchy instead of leaving adjacent
levels only one pixel apart. Their line-height ratios are unchanged from the earlier scale, so
the selected treatment keeps the rhythm reviewed in the comparison artifact.

Ordinary actions and navigation remain at their honest 400-weight faces. Keyboard focus uses
`line.focus` without changing metrics. A selected inline settings value may use the shipped
iA Writer Quattro Bold face in addition to its underline and accessible selected state. Do not simulate an
unshipped 500-weight action face or a medium monospace face.

`type.supporting` names small explanatory prose.

**A Markdown source marker takes the type role of the construct it marks** (decided 2026-07-29,
replacing an earlier rule that gave every marker `type.inline-code` whatever it stood in front
of). A heading's `#` is set in that heading's own role; a list's `-` and a quote's `>` in the
prose role; the backticks bounding inline code in `type.inline-code`; a fence's backticks and
language tag in `type.code`, with the block they open. A marker is part of the thing it marks,
and a `#` set two thirds the size of its own heading reads as debris beside it rather than as its
notation.

Face and size follow the construct; colour does not. Markers stay `text.muted` at every role,
because subordinate is what keeps visible notation from competing with the prose it sits beside.
The colour roles `text.secondary` and `text.muted` describe purpose and contrast, not an emphasis
ladder: a marker does not become supporting prose because both may be quiet.

Notation that never resolves is not a marker at all. An unmatched backtick is a character in a
sentence and is set as prose — §7.4's "incomplete syntax remains editable plain text", stated
here in type terms.

The inline ownership contract is absolute (**user feedback F07 and F10**): every inline run
inherits the enclosing block's baseline and line height. Body inline code keeps the optically
corrected 15 px mono face but sits on the 28 px prose line. Inline code in a heading uses the
heading's size and line height while staying Mono Regular rather than inheriting Bold (decided
2026-08-03); the mono family, Regular weight, and quiet `surface.code` are its distinction.
Emphasis, strong text, links, source delimiters, and fallback glyphs follow the same rule. No
inline role may create a shorter competing line box.

Fenced code is one coherent `type.code` 14 / 22 passage (**user feedback F08**). Its
`surface.code` is one continuous rectangular plane spanning the full code measure and every row;
per-token or per-line background ribbons are not an acceptable substitute. Its opening and closing fences and the declared
language tag are not drawn once the block is formed; under Raw Mode they reappear and join that
same plane, font, and 22 px rhythm as the code between them. A declared supported language colours stable syntax
categories; an absent or unknown language remains honest monospace text rather than receiving
misleading language colour. The closed highlighting inventory is Rust (`rust` or `rs`), the
JavaScript and TypeScript family (`javascript`, `js`, `jsx`, `typescript`, `ts`, or `tsx`), and
HTML (`html` or `htm`), case-insensitive. They distinguish keywords or structural names, strings,
and comments through the active `DesignSystem`; every other language hint, including `mermaid`,
remains plain code. More languages may be added only through this shared highlighter and palette
contract, never with miniapp-local colours.

List texture is structural typography (**user feedback F05, F09, and F12**). At each depth,
unordered and ordered markers occupy one fixed right-aligned column sized for a two-digit ordered
marker. Three-digit markers overhang to the left rather than moving their prose; dynamically
measuring the widest marker is deliberately reserved for a demonstrated need to read 100+ item
lists. Prose and explicit continuation lines share the content origin, and each nested level
advances exactly 14 px. Unordered markers are the literal `-` from the source, set on
the owning prose line in the marker column: the surface is source-honest, so a typeset bullet
would show something the file does not say. See §7.4. Reading ordered markers use body-sized iA Writer Quattro Bold on
that same line; the right-aligned column absorbs proportional and two-digit widths so the sequence
scans as hierarchy rather than body copy.

These geometry values are suite tokens owned by `DesignSystem`, not renderer literals:
`list_level_indent` 14 px, `reading_bullet_scale` 0.90 em, `marker_advance_factor` 0.60,
`prose_advance_factor` 0.52, and `mono_advance_factor` 0.62. They are approximate shaping
advances used only where the renderer must reserve space before exact glyph placement. Every
miniapp consumes the same values.

The prose size is globally adjustable in one-pixel steps from 14 to 28 px, defaults to 17 px,
and applies to Reading and Markdown Editing modes. Code size is independently adjustable from
12 to 24 px and defaults to 14 px. Font-size commands clamp silently at their limits.

Heading size is one global multiplier over the canonical heading ratios, adjustable from 85% to
125% and defaulting to 100%. The six levels descend strictly but use deliberately small steps
from H3 through H6, preserving hierarchy without turning a long document into a poster. There
are no six independent heading controls. Changing prose size retains the ratios; changing
heading scale never changes body size.

### 5.3 Measure and rhythm

- Prose measure: 60–75 characters per line; target 66.
- Reading column: target 560 px, minimum 480 px, maximum 640 px at default size. The measured
  60–75 character range is authoritative if font metrics or platform shaping require a narrower
  column.
- Main-surface horizontal inset: 64 px wide, 72 px compact. The compact value gives the widest
  heading marker room to hang outside the straight prose edge without crossing the window frame.
- Main-surface top inset: 80 px wide, 56 px compact.
- Bottom breathing room: at least 120 px, or enough virtual padding to bring first and last focus
  targets to the anchor. The leading and trailing gutters that do this are **not equal**, because
  the anchor is not centred (§7.6): the leading one is the anchor's distance from the top of the
  window, the trailing one is what remains below it. Equal gutters are only correct at the
  midpoint, and getting this wrong makes the last block of every document permanently unfocusable
  without changing how anything looks.
- Paragraph gap: 18 px, with no first-line indent.
- Opening H1 to following content: 28 px, with no space before it.
- Later H1 to preceding/following content: 44 / 28 px.
- H2 to preceding/following content: 44 / 18 px.
- List item gap: 6 px.
- Quote and code-block vertical margin: 24 px.

Adjacent semantic block margins collapse to the larger value. They never add: paragraph-to-H2 is
44 px, not 62 px, and paragraph-to-code or quote is 24 px, not 42 px. Reading applies these
semantic margins once between blocks. Markdown Editing preserves source-authored blank-line
rhythm and does not add Reading margins on top of editable source rows.

Spacing is allowed to scale with text size where fixed values would collapse the rhythm. Line
length wins over maximising the amount of text on screen.

Text is rasterised at the display's full device density, including fractional scaling. It is
reshaped when a window crosses displays. Low-DPI output must retain solid stems; never simulate
light weights with alpha.

## 6. Composition

### 6.1 Persistent regions

A document window has at most two persistent regions:

1. the current Document;
2. the optional Sidebar.

The Home Screen has one region. A code file has one main region plus the optional Sidebar.
Future miniapps follow the same rule: one primary surface and, only when necessary, one quiet
navigation surface.

| Region | Default | Minimum | Maximum |
| --- | ---: | ---: | ---: |
| Sidebar | 208 px | 176 px | 280 px |
| Main surface | remaining | 528 px | viewport |
| Reading column | 560 px | 480 px | 640 px |

The Sidebar begins at the top; it is never vertically centred as decoration. A single
`line.quiet` hairline may separate it from the main surface. It may live on either side and may
collapse completely. There is no visible collapse or move control.

The 528 px main minimum is the minimum useful shell viewport. Below the width needed for the
480 px reading minimum plus two compact insets, the 72 px marker clearance holds and the reading
measure yields; hiding source notation or denting its straight prose edge is not an acceptable
way to preserve the nominal column minimum.
If a viewport is narrower than 704 px—the main minimum plus the 176 px Sidebar minimum—the
Sidebar is responsively suppressed. This never changes the user's persisted visibility, side,
selection, or expanded directories; it cannot own keyboard focus while absent and returns
automatically when space does. Compact geometry is applied before this suppression. No mobile bar
or replacement chrome appears.

### 6.2 Layering

There are only three visual layers:

1. content;
2. selection/focus within content;
3. a user-summoned transient surface.

Transient surfaces use `surface.transient` as one calm replacement plane. They are not rounded
cards and do not float with shadows. The plane covers the content region so prose or Sidebar
fragments never peek around or below it; the Document state beneath is unchanged. Content uses
the same responsive geometry on every transient: a centred column no wider than 640 px, at least
32 px from either horizontal edge, at least 48 px from the top and 32 px from the bottom, with
vertical overflow scrolling inside those bounds. Compact windows reduce the horizontal inset to
24 px before reducing measure. There is no scrim, blur, dim, or decorative backdrop. A single
`line.quiet` hairline may identify the content column when the plane colour alone is insufficient.

Exactly one transient may be active. Summoning another replaces the current transient; it never
paints a second sheet above it. A dirty-close or failed-save prompt has priority and cannot be
displaced by Help or another ordinary command. Escape dismisses that actual active transient,
including while one of its controls owns keyboard focus.

### 6.3 Motion

Motion is rare:

- selection and file changes: immediate;
- mode changes: immediate;
- folder disclosure: immediate;
- incoming Focus Target: immediate;
- outgoing focus dim change: 120 ms;
- transient appearance: immediate.

There are no slides, springs, parallax, animated pills, skeleton screens, or progress shimmer.
The suite's single functional-motion token is 120 ms and is consumed only while the outgoing
Focus Target eases toward context. The incoming target reaches full contrast in the first
rendered frame so Focus Mode is unmistakable; it never fades in from context. Renderers do not
introduce private duration literals. With Reduce Motion enabled, the outgoing change also becomes
one frame; the other listed changes are already one frame. The previous usable surface remains
until replacement content is ready.

## 7. Surface contracts

### 7.1 Home Screen

The Home Screen is a quiet typographic threshold, not a branded splash or dashboard.

- Centre one narrow action column optically above the viewport midpoint.
- Show only the actions permitted by the product scope: Open folder, Open file, Create folder,
  Create file, Clear recents, and the Recent Entries themselves.
- Render actions as left-aligned text lines with keyboard focus expressed by `line.focus`, never
  boxes or a metric-changing synthetic weight.
- Place Recent Entries below one generous gap, most recent first. Use the path in monospace and
  the kind/unavailable state as quiet text, not icons or badges.
- Show empty and refusal states inline in the same column.
- Do not show a logo, illustration, welcome paragraph, tips carousel, version, news, or settings
  collection.

### 7.2 Sidebar

The Sidebar is a dense file tree and nothing else.

- `type.navigation`, 22 px rows, 14 px nesting increments.
- Directories first, then files, case-insensitive alphabetical order.
- Preserve extensions. Truncate long names without increasing row height.
- Use a small disclosure glyph only for directories. Do not use file or folder icons.
- Default rows have no fill. Hover may use `surface.selection` at reduced emphasis.
- The selected row uses primary text at the shipped regular monospace weight, a quiet full-width
  wash, and a 2 px inset `line.focus` hairline. This is the canonical resolution of selected-row
  treatment without requiring a synthetic or unshipped medium face.
- Keyboard focus adds a high-contrast underline or inset hairline without changing geometry.
- Git states are one right-aligned monospace letter (`A`, `M`, or `D`) plus a semantic state
  colour. Conflict uses `M` and accessible text exposes “conflict.”
- No create, rename, delete, refresh, collapse, filter, Git, or settings buttons appear in the
  tree. Those commands live in the command list, shortcuts, native menu, or a transient settings
  surface.
- When Markdown-only filtering hides entries, one terminal explanatory text row states that
  files are hidden and includes an inline text action to show them. In the filtered empty state,
  that text action is the required surfaced filter toggle. It is content state, not a bar.
- Empty, unreadable, deleted, and unavailable states are plain text rows in place.

### 7.3 The document surface

There is one document surface and no modes. Markdown is rendered prose, selectable, and editable
in place. A caret appears where you put one and not before; nothing is entered, and nothing has to
be left.

- Use one uninterrupted `surface.canvas`; never place the reading column on a card.
- Centre the reading measure within the main region.
- At a fresh, absolute, or restored semantic Document start, place the first content at the
  canonical 80 px wide-window or 56 px compact-window top inset. Leading and trailing virtual
  Focus gutters remain reachable scroll extent, but raw virtual-padding zero is never the
  initial reading position. Deliberate Focus navigation may still centre the first or last target
  in the viewport, including at 0% Dim. Sidebar disclosure does not change vertical position.
- Render the pinned CommonMark/GFM constructs semantically.
- Hide source markers. Links show their labels, not destinations.
- Use indentation and one quiet hairline for blockquotes.
- Use `surface.code` sparingly for code; no copy button or code-block title bar.
- Draw no application scrollbar, indicator, track, thumb, paging affordance, or scroll control.
  The preferred surface has no visible scroll control at all. If the operating system
  independently presents its transient accessibility or overlay indicator during direct
  scrolling, the suite neither replaces nor styles it; nothing is visible at rest.
- Raw HTML is inert text. Remote images are never fetched. Missing and blocked images receive a
  quiet, size-stable text placeholder.
- Relative links to Markdown and other local text Documents stay in this window and leave a
  reversible in-app history entry. Fragment-only links move the Focus Target within the current
  Document. Only explicit `http` and `https` links cross the process boundary, through the
  operating system browser; no link causes `zd md` itself to fetch remote content.
- Navigation, find, outline, external-change, deletion, and read failures appear in place and
  preserve the reader's semantic anchor.

When the open path disappears, retain the last rendered content and place one persistent
document-local notice line above it: “file no longer exists.” This deletion notice is rendered as
text on the document plane rather than decorative chrome. It withdraws
when the path reappears and never carries a button.

### 7.4 Markdown notation on the surface

The surface is source-honest, inspired by iA Writer's discipline. It is not a conventional code
editor, and it is not a preview of one.

- The canvas, centred prose origin, measure, prose family, heading scale, focus behaviour, and
  anchor are §7.3's, because they are the same surface. Semantic block margins apply throughout;
  source-authored blank lines are preserved rather than collapsed.
- **Short notation stays literal; the rest renders** (decided 2026-07-29, superseding an earlier
  rule that kept every marker on screen). Literal markers are a heading's `#`, list markers `-` and
  ordered markers, a quote's `>`, the single backticks bounding inline code, and emphasis
  delimiters. Each is set in the type role of the construct it marks (§5.2) and coloured
  `text.muted`. Rendered constructs are links,
  tables, fenced code, images, and horizontal rules: their delimiters, destinations, pipes, fence
  characters, and language tags do not appear. The dividing line is legibility, not purity — a raw
  pipe table is unreadable and a `#` is not.
- **Raw Mode is a document-wide toggle, default off.** It reveals the literal source of every
  rendered construct above and changes nothing else: canvas, measure, focus, and type roles are
  unaffected. Notation is never revealed by caret proximity, in either state; the toggle is the
  only thing that reveals.
- **Block notation hangs to the left of its own text edge.** A heading's `#`, a quote's `>`, and a
  list's `-` all sit outside the text they mark, so the reading column is one straight line at
  every width. Prose and soft-wrapped rows return to that edge, so visible notation never creates
  an accidental second margin and never dents the measure.
- **Which edge depends on whether the block owns an indent** (decided 2026-07-29). A heading has
  no boundary of its own, so its `#` hangs in the shared notation gutter outside the measure. A
  quote and a list item each already own an indent — and a quote its hairline — so their markers
  right-align into that indent instead, and their text lands exactly where the reading surface
  puts it. A marker pushed outside a quote's hairline would read as belonging to the page rather
  than to the quote, which is the opposite of what the notation is for.
- Unordered items show their literal `-` in the marker column rather than a typeset bullet: the
  source is what is on screen. This supersedes the reading bullet described in §5.2.
- **Structure continues as it is typed, in the manner of a chat composer.** `>` followed by a space
  or Enter opens a blockquote and Enter continues it; a second consecutive Enter leaves it. A fence
  with an optional language opens a code block on Enter; a second consecutive Enter closes it.
  Nothing else is auto-inserted, and every one of these is a single undo away from the literal
  characters typed.
- Lists alone receive a local optical marker column sized for a two-digit ordered marker at every
  depth. Wider markers overhang to the left, prose begins after the stable column, nested item
  origins advance 14 px, and explicit or soft-wrapped continuation rows return to the owning
  item's prose origin (**user feedback F05, F09, and F12**). This is list typography, not
  application chrome.
- Apply CommonMark delimiter flanking before assigning source emphasis. Intraword underscores in
  identifiers such as `HEADING_SENTINEL_01-rollout-plan` remain literal (**user feedback F06**).
- Keep body and heading inline code on their enclosing line metrics, and render fenced passages
  as coherent 14 / 22 surfaces with supported declared-language colour (**user feedback F07,
  F08, and F10**).
- A link shows its label. Its brackets and destination are not drawn at all in the default state,
  and appear only under Raw Mode; they never take the gutter treatment, because the gutter is for
  the notation that stays.
- Incomplete syntax remains editable plain text.
- Do not add line numbers, a minimap, gutter controls, folding controls, autocomplete, diagnostics,
  or a persistent dirty indicator. The notation column is not a gutter control; nothing in it is
  clickable.
- A document opens without a caret. That is a starting position, not a read-only state — the first
  click or keystroke places one.

There is no mode decision left to make. The surface is rendered and editable at the same time, and
the visible notation is what makes that honest rather than a preview.

### 7.5 Files that are not Markdown

Non-Markdown text opens on the same surface, rendered as code rather than parsed as Markdown.

- Use the mono family and the shared canvas; retain a comfortable source measure but do not force
  the prose maximum on long code.
- Paint undecorated text first, then viewport-bounded syntax colour.
- Provide only text, selection, caret, syntax colour, scrolling, undo, and saving.
- Do not provide language servers, completion, breadcrumbs, tabs, minimap, refactoring, debugger,
  line numbers, or IDE gutters.
- Read-only, undecodable, or over-limit files remain scrollable and state why editing is
  unavailable inline.

### 7.6 Focus and Typewriter modes

Focus is visual emphasis, never selection. Its target is the caret. Before a caret is placed it
follows the vertical anchor and deliberate reading navigation. **The anchor sits a third of the way
down the window, not at its centre** — where the eye rests reading (settled 2026-07-30, after being
implemented at the exact midpoint on a literal reading of vision §4.1 and rejected in use). A
document also *opens* with its first block on the anchor: the opening position and the position
focus is read from have to be the same one, or the first pixel of scroll moves focus several blocks.
Once a caret is in the document,
scrolling for context leaves focus where it is, because reading ahead is not moving. Line means one
laid-out visual line; paragraph means one semantic block, and a whole list is one such block
rather than one item of it (clarified 2026-07-29 — the older "block/list item" wording permitted
both, and the reader and the editor each picked a different one); section means a heading and
its descendants up to the next peer or higher heading.

When that section would be the whole document, section granularity falls back to paragraph
focus. A document with one section still needs a visible focus target; leaving every block at full
contrast makes the setting inert. This is about the computed section, not the count of H1s: a
document with one title and useful H2 sections keeps section focus.

**A paragraph immediately followed by a code block is one paragraph-granularity target with it,
in both directions.** The prose that introduces a command and the command are one thing to read,
and dimming either while the other is lit takes away the half that explains the other. Added
2026-07-30 after the same line of a README was reported twice — "if its highlighted for focus the
code block right below it should be highlighted for focus" — the second time as blocking. This is
a change to what *paragraph* means, not a fourth granularity: the alternative was a new selectable
level, and a level nobody can select is not an answer while §7.9's settings surface is unbuilt.
Only a code block pairs, fenced or indented. Two paragraphs in a row are two thoughts and stay two
targets; a list following a paragraph is left alone until someone reports it, because "the block
after this one" as a general rule ends at the section granularity that was already rejected as too
wide.

Line targeting and painting use CodeMirror's actual visual rows at the presented wrap width. The
editor maintains an explicit source-byte ↔ marker-free-display map, adopts the row
containing the source anchor as the Focus Target, and restores full role contrast only across that
row. Proportional glyph widths, mixed semantic styles, Markdown markers, CJK, and emoji may never
fall back to a characters-per-line estimate. Other wrapped rows in the same paragraph remain
context at the current Dim Level.

Typewriter Mode needs a caret, so it is available whenever there is one. It pins that line at
the vertical midpoint and moves the document beneath it after typing or caret movement. Manual
scrolling is always allowed. With multiple columns, pinning suspends and resumes when one column
returns. Focus and Typewriter modes always identify the same current line.

Word Wrap is a suite preference applied to every document. It is on by default and toggled by
`cmd+option+z` on macOS or `ctrl+alt+z` elsewhere. Including the logical modifier prevents
keyboard layouts from turning Option/Alt+Z into source text. There is no state in which the
setting is unavailable: one surface means one always-live toggle.
Turning it off changes only editor layout; it never changes source text.

Neither mode adds an on-canvas label, switch, guide line, glow, or animation.

### 7.7 Column Splits

Columns reflow one Markdown Document; they never create panes or show multiple Documents.

- One column is the default.
- Every column retains the 60–75 character measure.
- The requested count clamps silently to the available width and returns when width allows.
- Content advances from the bottom of one column to the top of the next.
- Oversized tables, code blocks, and images span the set rather than clip.
- Focus dimming applies consistently across all visible columns.
- The active reading column is not outlined or decorated.
- `cmd+]` / `ctrl+]` adds one column and `cmd+[` / `ctrl+[` removes one. These adjacent inverse
  bindings replace the original `cmd+|` proposal because that chord collides with macOS
  credential-manager and system integrations.

### 7.8 Quick Open, Find, Outline, Command List, and Shortcut Reference

Quick Open, Outline, and Command List are transient text surfaces sharing one composition:

- one focused query line;
- one compact result list;
- one quiet inline empty/error line when needed;
- no submit button, close button, search icon, result cards, Git decoration, or footer of shortcut
  hints.

The first result is selected by typography and hairline, not a pill. Results update while typing
and remain usable during progressive discovery. Quick Open shows path and heading matches;
Outline shows heading hierarchy; Command List shows command names and platform-correct shortcuts.
They remain distinct commands and data sources. Find deliberately uses the still quieter
composition required by REQ-READ-16: one focused query line, an aggregate result count, and
document-local match marking. It does not duplicate those matches into a second result list.
The Shortcut Reference is a fixed two-column registry rather than a searchable list.

`cmd+shift+p` / `ctrl+shift+p` opens the Command List from every suite surface. This standard,
chromeless entrance is itself listed in the Shortcut Reference; no visible launcher or menu bar
is needed.

`cmd+.` opens the Shortcut Reference as a quiet two-column text sheet: platform-correct key
notation on the left and the action name on the right. It lists every shipped hotkey from one
shared command registry. Pressing `cmd+.` again or Escape dismisses it without changing the
surface, selection, caret, reading position, or Focus Target beneath it. It has no close button,
footer, search field, category cards, or persistent launcher.

### 7.9 Settings

Settings is a transient typographic sheet over the current surface. It never navigates away from
the Document and is also available from Home.

The initial control set is closed and follows `appearance.feature` exactly:

1. Theme;
2. Blue Light Filter;
3. Dim Level;
4. Focus Granularity;
5. Word Wrap;
6. prose size;
7. code size;
8. heading scale;
9. Sidebar side;
10. Typewriter Mode;
11. Markdown-Only Filter.

Use aligned label/value rows. Choice controls are inline text choices; continuous controls use a
minimal hairline track with a text value; toggles use the words `on` and `off`. The active value
is distinguished by weight, underline, and accessible selected state. There are no switches,
checkbox boxes, cards, section panels, save/apply/cancel buttons, theme editors, font pickers,
keybinding editors, or advanced disclosure sections.

Changes take effect immediately and persist without an Apply action. Dismissal keeps them.
All eleven global rows remain visible in every context and in that order. Word Wrap is visibly
unavailable without a caret, and Typewriter Mode is visibly unavailable outside applicable
single-column layouts, rather than causing the closed inventory to change.
Restore-previous-session remains a persisted preference but is not added to this surface during
the initial prototype. Reset global settings is a named command, not a settings control.

Diff Mode is a contextual Workspace command shown as a final text row beneath the closed settings
set, not an appearance or behavior preference added to that set. It reads `Diff Mode — on|off`
for a Git Workspace and `Diff Mode — unavailable` otherwise. The unavailable row remains visible,
has disabled accessibility state, and activates nothing.

### 7.10 Status, notices, and errors

The Document Status Strip is the sole sanctioned bottom strip and exists only after its command.
It is a single line of `type.supporting` text on the canvas, disappears after ten seconds, and
never reserves permanent layout space. It reports the live buffer, including unsaved changes.

All other status is local:

- file filtering is stated in the Sidebar;
- read-only and external-file state is stated at the Document;
- settings/font/storage problems are stated in Settings or as one non-blocking notice;
- Home actions fail inline;
- path and launch failures use standard error before a window opens.

Notices do not become stacked toasts, modal dialogs, decorative banners, badges, or permanent
status areas. The deletion notice defined by §7.3 is the sole persistent document-local
banner. When user action is possible, embed a text action in the sentence.

## 8. Interaction language

Keyboard access is complete and platform-logical. macOS uses Cmd and Windows uses Ctrl for the
logical modifier. The Command List is the discoverability mechanism for commands; the canvas is
not.

Pointer and keyboard activation share the same semantic action. Every control:

- has a visible text label;
- has a stable accessible name, role, value, and state;
- can be reached and operated without a pointer;
- retains a minimum 32 px invisible vertical hit area outside the dense 22 px file-tree exception;
- shows keyboard focus without relying on colour;
- refuses inapplicable or clamped operations quietly.

Escape dismisses the top transient surface. With nothing transient open it does nothing, because
there is no mode to unwind. It never cascades through two states in one press.

A **held** surface is not a transient in this sense and Escape has no part in it. The Shortcut
Reference is held: it is on screen while `cmd+.` is down and gone when it is released (settled
2026-07-30), so there is no moment at which Escape could dismiss it, and registering a command that
could never run is what §7.1 forbids. Escape therefore reaches the document, where it drops the
caret and hands focus back to the anchor block — the one key, one answer rule holding rather than
being worked around by letting two commands share a chord.

## 9. Accessibility and reading comfort

Accessibility is part of the rendering architecture, with a deliberately bounded prototype
claim:

- keyboard-only reading, opening, editing, saving, and every shipped command are implemented;
- interactive controls and Sidebar rows expose stable DOM names plus selected/disabled state;
- virtualised off-screen content remains reachable through source-position navigation, not the
  lifetime of a rendered CodeMirror row;
- document-structural screen-reader semantics for heading, paragraph, list, link, quote, and code,
  and full screen-reader certification, are explicitly deferred by `REQ-PLAT-20` / OQ 47. They
  are the next accessibility target, not a delivered prototype claim;
- support OS text scaling, high contrast needs, colour vision deficiency, Reduce Motion,
  fractional scale, low DPI, IME input, and grapheme-safe caret movement;
- do not truncate text because a user increased OS or suite text size;
- keep Focus context legible and make 0% dimming a complete escape hatch;
- use colour plus letters, language, line treatment, or position for every state;
- never autoplay sound, motion, or ambient effects.

Typography and contrast must be reviewed on a 96 dpi 1× screen, a high-density screen, and
125%, 150%, and 175% fractional scaling before release.

## 10. Performance is part of the aesthetic

Calm disappears when the interface stalls. The visual design therefore depends on the accepted
architecture in `docs/adr/md/0001-use-browser-layout-for-markdown_H.md`: CodeMirror and Lezer own incremental document work, the DOM
owns typography, and the thin Tauri shell owns native files, Git, and windows.

A suite appearance change increments one shared `style_revision`. Miniapps invalidate only
layout entries whose semantic style inputs changed. Repeated size, warmth, column, or resize
input coalesces to the newest revision. Visible content and the focus/caret region are prepared
first.

The implementation must:

- show input in the receiving frame;
- paint a useful first screen before optional parsing, syntax, indexing, or Git completes;
- keep work proportional to the viewport rather than total Document or Workspace size;
- preserve the reader's place through font, theme, Sidebar, mode, column, and external-file
  changes;
- avoid continuous repaint, polling, parsing, or animation while idle;
- segment a pathological huge line or block so it cannot monopolise a frame;
- load all fonts, themes, settings, and content locally with no network dependency.

Visual review is performed in release builds against the budgets in `docs/VISION.md` §10. A
beautiful screen that misses those budgets is a failed design.

## 11. Verification map

Tests live beside the module or at a system cut-point. This map identifies the design obligation
each current verification surface places on the suite.

| Verification surface | Design obligation |
| --- | --- |
| `packages/app/tests/unit/` | Document state, parsing, commands, preferences, and boundary contracts |
| `packages/app/tests/e2e/` | Rendered typography, focus, editing, motion, shortcuts, and layout |
| `packages/tauri/src/*` tests | Native launch, file safety, workspace scope, and CLI behavior |
| `packages/scripts/tests/unit/` | Repository layout and contributor automation contracts |

Every changed surface needs the smallest test that proves its behavior. Rendering, contrast,
accessibility, and layout claims require browser coverage in addition to pure state tests.

## 12. Governance

### 12.1 Change procedure

Any graphic or UI change, including a token, font metric, spacing value, interaction state,
wording layout, new surface, or modification to this document, requires:

1. review against the relevant vision requirements and architecture constraints;
2. implementation through suite semantic tokens, never a miniapp-local literal;
3. automated behavior tests and appropriate render/contrast/accessibility tests;
4. release-build performance verification proportional to the change;
5. review by a senior typography and graphic designer;
6. a deliberate check in Light, Dark, warmest, 0% dim, 100% dim, Reduce Motion, keyboard-only,
   low-DPI, high-DPI, and fractional-scale conditions.

Theme changes are suite migrations. They are never scoped to “just this miniapp.” Changing a
shared role must visibly update every consuming miniapp in the same review.

### 12.2 Adding a semantic role

A new role is allowed only when:

- the meaning cannot be expressed by an existing role;
- at least one real surface needs it now;
- its Light and Dark values, warmed behavior, contrast, colour-independent cue, and accessibility
  semantics are defined here;
- it reduces rather than spreads visual decision-making.

Do not add an abstraction for a hypothetical future app. Repeated real meaning earns a token;
mere repeated colour does not.

### 12.3 Prohibited drift

Reject a change if it introduces:

- miniapp-specific themes or appearance preferences;
- raw visual values outside suite style definitions;
- persistent controls or status;
- boxed, pill-shaped, icon-only, or decorative actions;
- a third persistent region;
- an animation whose absence would not impair understanding;
- a visual state that is colour-only;
- a network dependency for rendering;
- whole-document or whole-workspace work in a frame;
- a new customization option without a BDD requirement.

## 13. Binding verification obligations

A visual implementation is accepted only when every applicable statement is proven by the
corresponding behavior, render, accessibility, contrast, performance, or review evidence. This is
a binding verification list, not a mutable completion checklist.

### Suite

- One suite-owned appearance/style resolver feeds the shell, every miniapp, and every
      transient surface.
- Changing Theme or warmth in one miniapp updates every open miniapp.
- Miniapp UI code contains no raw visual values or theme-name branches.
- System, Light, and Dark are the only shipped Theme choices.
- The product icon uses the same flat paper, ink, and shipped iA Writer Quattro system and remains
      legible at 16, 32, 128, and 1024 px.

### Restraint

- At rest there is one primary surface and at most one compact navigation surface.
- No application bar, toolbar, tabs, control strip, persistent status, custom title, footer,
      decorative chrome, or styled scrollbar is visible.
- No action is rendered as a boxed button, pill, tile, or unexplained icon.
- Hierarchy is carried by type, space, indentation, alignment, and at most a hairline.

### Typography and colour

- Prose, code, Markdown markers, navigation, and supporting text use their canonical roles.
- Reading measure remains 60–75 characters in one or many columns.
- Final body contrast, including warmth and focus, remains in the 7:1–15:1 band.
- Light, Dark, 2700 K, low-DPI, high-DPI, and fractional-scale rendering have been inspected.
- Missing bundled or document glyphs fall back without blocking launch.

### Modes and surfaces

- Existing Markdown opens rendered and editable, with no caret placed yet.
- Markdown editing keeps source notation visible without becoming a code-editor surface.
- Non-Markdown editing remains monospaced and deliberately non-IDE.
- Sidebar, Home, Quick Open, Settings, Find, Outline, notices, Diff, Focus, Typewriter, and
      Columns follow their surface contracts.
- Transient surfaces leave the Document state beneath them unchanged, visually replace the
      content plane, and Escape dismisses only the one active transient.

### Access and speed

- Keyboard focus, selected state, Git state, and errors remain understandable without colour.
- Every action is named, keyboard-operable, and exposed through accessibility semantics.
- Reduce Motion renders transitions in one frame.
- Semantic viewport position survives every layout-affecting visual change.
- Relevant unit, rendering, accessibility, contrast, and release performance tests pass.
- A senior typography and graphic designer has approved the rendered result and this contract.

If any statement is achieved with a local exception, it is not actually satisfied.

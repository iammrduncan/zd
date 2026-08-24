# Theme configuration reference

A theme configuration is a local, data-only JSON file that supplies every semantic colour used by
the workbench. Use this page while creating or validating a `<name>.theme.config` file.

For installation and selection steps, see [Customize themes](../how-to/customize-themes.md).

## File contract

| Property | Requirement |
| --- | --- |
| Location | A direct child of the platform configuration directory’s `zd` folder. |
| Filename | `<name>.theme.config`, where `<name>` starts with a letter or number and contains no more than 64 letters, numbers, `_`, or `-` characters. |
| Reserved IDs | `system` and `workbench`. Built-in IDs cannot be replaced. |
| Encoding | UTF-8 JSON. |
| Maximum size | 65,536 bytes. |
| Discovery | At application launch. Nested files, directories, and symbolic links are rejected. |

## Root fields

| Field | Type | Requirement |
| --- | --- | --- |
| `schemaVersion` | number | Must be `1`. |
| `name` | string | Display name, 1–64 safe characters. URLs and executable text are rejected. |
| `appearance` | string | `light` or `dark`. Controls native colour-scheme behavior. |
| `colours` | object | Every semantic colour role in the table below. |
| `syntax` | object | Every syntax role in the table below. |

The schema is closed. Additional or missing keys are invalid. Every colour is a six-digit
`#RRGGBB` value. Required foreground/background pairs must meet the built-in contrast policy; pure
black paired directly with pure white is rejected.

## Complete example

```json
{
  "schemaVersion": 1,
  "name": "My Theme",
  "appearance": "dark",
  "colours": {
    "surface.canvas": "#191A19",
    "surface.sidebar": "#20211F",
    "surface.transient": "#222320",
    "surface.selection": "#30322E",
    "surface.code": "#242622",
    "surface.diff-added": "#26352A",
    "surface.diff-deleted": "#382827",
    "text.primary": "#E5E2D9",
    "text.secondary": "#B4B1A9",
    "text.muted": "#B4B5AE",
    "text.link": "#A8CCD8",
    "line.quiet": "#353733",
    "line.focus": "#86A9B2",
    "state.added": "#A6CFB1",
    "state.changed": "#D1B36C",
    "state.deleted": "#D99993",
    "state.ignored": "#777A73",
    "state.error": "#DB938B",
    "state.waiting": "#86A9B2",
    "state.busy": "#D7A252",
    "state.idle": "#777A73"
  },
  "syntax": {
    "keyword": "#D9A3B6",
    "type": "#8FBFD1",
    "function": "#D0B078",
    "string": "#A9C8A0",
    "number": "#C9A3D5",
    "comment": "#8E938B",
    "punctuation": "#B4B1A9"
  }
}
```

## Semantic colour roles

| Role | Use |
| --- | --- |
| `surface.canvas` | Main workbench and document background. |
| `surface.sidebar` | Projects, Files, and Changes backgrounds. |
| `surface.transient` | Settings and other temporary planes. |
| `surface.selection` | Selected rows, text, and active context. |
| `surface.code` | Code blocks and code-editor background. |
| `surface.diff-added` | Added-line diff background. |
| `surface.diff-deleted` | Deleted-line diff background. |
| `text.primary` | Main prose, code, and interface text. |
| `text.secondary` | Supporting labels and metadata. |
| `text.muted` | De-emphasized context. |
| `text.link` | Links and interactive text accents. |
| `line.quiet` | Dividers and inactive boundaries. |
| `line.focus` | Keyboard focus and active boundaries. |
| `state.added` | Added Git state. |
| `state.changed` | Changed Git state. |
| `state.deleted` | Deleted Git state. |
| `state.ignored` | Ignored Git state. |
| `state.error` | Errors and destructive warnings. |
| `state.waiting` | Waiting thread state. |
| `state.busy` | Busy thread state. |
| `state.idle` | Idle thread state. |

## Syntax roles

| Role | Use |
| --- | --- |
| `keyword` | Language keywords and control words. |
| `type` | Types, classes, and type-like names. |
| `function` | Function and method names. |
| `string` | String and character literals. |
| `number` | Numeric literals and constants. |
| `comment` | Source comments. |
| `punctuation` | Operators, delimiters, and ordinary code punctuation. |

## Built-in themes

| ID | Display name | Appearance |
| --- | --- | --- |
| `current-light` | Current Light | light |
| `dark` | Dark | dark |
| `dracula` | Dracula | dark |
| `homebrew` | Homebrew | dark |

The Homebrew theme matches the defining background, text, selection, and cursor colours of the
macOS Terminal Homebrew profile. The Dracula built-in includes the Dracula Theme MIT license
notice.

## Validation results

One invalid theme produces one local notice. Other custom themes and all built-ins remain
available. An unavailable global selection falls back to the last valid theme, then Current Light.
An unavailable surface override returns to workbench inheritance.

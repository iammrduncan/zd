# 0002. Own one source-ranged document model

Date: 2026-09-26

## Status

Accepted by owner direction. It replaces the archived Markdown surface decisions for v1.

## Context

Editing, Markdown reading, mouse selection, comments, agent handoff, and image-link insertion all
refer to source text. Separate editable and rendered buffers would make selections drift and would
force each feature to invent conversions among UTF-8 bytes, Unicode text, graphemes, wrapped rows,
and terminal cells.

Markdown rendering also creates cells that have no literal source character, such as list markers
and table layout. A visually convenient but guessed mapping would attach comments or prompts to the
wrong text.

## Decision

One `Document` owns the UTF-8 source buffer, revision, cursor, half-open byte selection, edit
transactions, history, dirty state, find/replace, and atomic-save confirmation. One conversion
boundary maps bytes, Unicode scalar values, grapheme clusters, logical rows/columns, and terminal
cells.

Edit mode and Markdown Read mode are projections over that same document. Rendered spans carry exact
parser-derived source ranges. A synthetic or ambiguous span is non-selectable or maps to an explicit
whole-node range; the UI never fabricates a character-precise source offset.

Comments, agent handoff, and image-link insertion consume `Document` source selections and edit
transactions. Widgets and adapters do not maintain independent source text, cursor, selection, or
revision state.

## Consequences

Every feature can identify the same text across modes, and undo/redo can treat compound actions as
one semantic edit. The document module must absorb difficult Unicode and coordinate conversion work,
and Markdown rendering must preserve parser offsets through wrapping.

Some visually rendered Markdown content will intentionally be non-selectable when truthful mapping
is unavailable. This is preferable to a polished interaction that comments on or sends the wrong
source.

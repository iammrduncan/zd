export {
  DEFAULT_FIND_OPTIONS,
  MAX_FIND_MATCHES,
  MAX_FIND_QUERY_CODE_UNITS,
  findText,
  replacementFor,
  type FindMatch,
  type FindOptions,
  type FindResult,
  type SourceRange,
} from "./matches";
export {
  MARKDOWN_PARSE_SLICE_MS,
  markdownSourceVisibility,
  visibleMarkdownSourceRanges,
  type MarkdownSourceVisibility,
} from "./markdown";
export { editorFindExtension, showFindDecorations } from "./decorations";
export {
  createEditorFind,
  type EditorFind,
  type FindSnapshot,
  type ReplaceResult,
  type ReplaceStatus,
} from "./session";

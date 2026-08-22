export { createEditor, type Editor, type EditorOptions } from "@/miniapps/md/editor/editor";
export {
  LANGUAGE_REGISTRY,
  LANGUAGE_REGISTRY_VERSION,
  MARKDOWN_DOCUMENT,
  PLAIN_TEXT_DOCUMENT,
  languageFor,
  type DocumentLanguage,
  type LanguageRegistration,
} from "./language";
export {
  EDITOR_BUFFER_SCHEMA_VERSION,
  editorBufferFromRead,
  type BoundedFileRead,
  type EditorBuffer,
  type EditorBufferKind,
} from "./buffer";
export {
  mountEditorBuffer,
  type MountedEditorBuffer,
  type MountEditorBufferOptions,
} from "./surface";

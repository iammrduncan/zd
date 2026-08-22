import { languageFor, type DocumentLanguage } from "./language";

export const EDITOR_BUFFER_SCHEMA_VERSION = 2 as const;

export type BoundedFileRead =
  | {
      readonly status: "text";
      readonly text: string;
      readonly byteLength: number;
      readonly writable: boolean;
      readonly reason?: string;
    }
  | { readonly status: "binary"; readonly byteLength: number }
  | { readonly status: "undecodable"; readonly byteLength: number }
  | { readonly status: "missing" }
  | { readonly status: "denied" }
  | {
      readonly status: "over-limit";
      readonly byteLength: number;
      readonly limit: number;
      readonly preview: string | null;
    }
  | { readonly status: "unavailable"; readonly problem: string };

export type EditorBufferKind = BoundedFileRead["status"] | "editable" | "read-only";

export interface EditorBuffer {
  readonly schemaVersion: typeof EDITOR_BUFFER_SCHEMA_VERSION;
  readonly identity: string;
  readonly kind: EditorBufferKind;
  readonly path: string;
  readonly language: DocumentLanguage;
  readonly content: string | null;
  readonly byteLength: number | null;
  readonly editable: boolean;
  readonly reason: string | null;
}

function unavailable(reason: string): string {
  const sentence = /[.!?]$/.test(reason.trim()) ? reason.trim() : `${reason.trim()}.`;
  return `${sentence} Editing is unavailable.`;
}

function mebibytes(bytes: number): string {
  const value = bytes / (1024 * 1024);
  return `${Number.isInteger(value) ? value : value.toFixed(1)} MiB`;
}

/**
 * Translate one bounded native read into the exhaustive state the editor renders.
 * No error string is parsed and no byte sequence is decoded in the frontend.
 */
export function editorBufferFromRead(
  path: string,
  read: BoundedFileRead,
  identity = `live:${path}`,
): EditorBuffer {
  const common = {
    schemaVersion: EDITOR_BUFFER_SCHEMA_VERSION,
    identity,
    path,
    language: languageFor(path),
  } as const;

  switch (read.status) {
    case "text":
      return read.writable
        ? {
            ...common,
            kind: "editable",
            content: read.text,
            byteLength: read.byteLength,
            editable: true,
            reason: null,
          }
        : {
            ...common,
            kind: "read-only",
            content: read.text,
            byteLength: read.byteLength,
            editable: false,
            reason: unavailable(read.reason ?? "This file is read-only"),
          };
    case "binary":
      return {
        ...common,
        kind: "binary",
        content: null,
        byteLength: read.byteLength,
        editable: false,
        reason: unavailable("Binary file"),
      };
    case "undecodable":
      return {
        ...common,
        kind: "undecodable",
        content: null,
        byteLength: read.byteLength,
        editable: false,
        reason: unavailable("This file is not valid UTF-8; no encoding was guessed"),
      };
    case "missing":
      return {
        ...common,
        kind: "missing",
        content: null,
        byteLength: null,
        editable: false,
        reason: unavailable("This file no longer exists"),
      };
    case "denied":
      return {
        ...common,
        kind: "denied",
        content: null,
        byteLength: null,
        editable: false,
        reason: unavailable("Permission denied"),
      };
    case "over-limit": {
      const preview =
        read.preview === null
          ? "No safe text preview is available."
          : "A bounded preview is shown read-only.";
      return {
        ...common,
        kind: "over-limit",
        content: read.preview,
        byteLength: read.byteLength,
        editable: false,
        reason: `This file exceeds the ${mebibytes(read.limit)} editing limit. ${preview}`,
      };
    }
    case "unavailable":
      return {
        ...common,
        kind: "unavailable",
        content: null,
        byteLength: null,
        editable: false,
        reason: unavailable(read.problem),
      };
  }
}

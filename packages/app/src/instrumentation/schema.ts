export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const;

export type DiagnosticOutcome = "ok" | "cancelled" | "refused" | "failed" | "unavailable";

export interface DiagnosticContextInput {
  readonly projectId?: string;
  readonly worktreeId?: string;
  readonly threadId?: string;
  readonly threadSessionId?: string;
  /** A path is reduced to depth and extension before it can cross the native boundary. */
  readonly logicalPath?: string;
}

export interface RedactedLogicalPath {
  readonly scope: "project" | "redacted";
  readonly depth: number;
  readonly extension?: string;
}

export interface DiagnosticContext {
  readonly projectId?: string;
  readonly worktreeId?: string;
  readonly threadId?: string;
  readonly threadSessionId?: string;
  readonly logicalPath?: RedactedLogicalPath;
}

interface DiagnosticBaseInput {
  readonly operation: string;
  readonly context?: DiagnosticContextInput;
}

export interface DiagnosticEventInput extends DiagnosticBaseInput {
  readonly recordType: "event";
  readonly outcome: DiagnosticOutcome;
}

export interface DiagnosticSpanInput extends DiagnosticBaseInput {
  readonly recordType: "span";
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly durationUs: number;
  readonly outcome: DiagnosticOutcome;
}

export interface DiagnosticErrorInput extends DiagnosticBaseInput {
  readonly recordType: "error";
  /** A reviewed stable code, never an exception message. */
  readonly code: string;
}

export interface DiagnosticStateInput extends DiagnosticBaseInput {
  readonly recordType: "state";
  readonly from: string;
  readonly to: string;
}

export type DiagnosticRecordInput =
  DiagnosticEventInput | DiagnosticSpanInput | DiagnosticErrorInput | DiagnosticStateInput;

export type PreparedDiagnosticRecord =
  | (Omit<DiagnosticEventInput, "context"> & { readonly context?: DiagnosticContext })
  | (Omit<DiagnosticSpanInput, "context"> & { readonly context?: DiagnosticContext })
  | (Omit<DiagnosticErrorInput, "context"> & { readonly context?: DiagnosticContext })
  | (Omit<DiagnosticStateInput, "context"> & { readonly context?: DiagnosticContext });

export type DiagnosticPreparation =
  | { readonly ok: true; readonly value: PreparedDiagnosticRecord }
  | { readonly ok: false; readonly problem: string };

const BASE_KEYS = ["recordType", "operation", "context"] as const;
const CONTEXT_KEYS = [
  "projectId",
  "worktreeId",
  "threadId",
  "threadSessionId",
  "logicalPath",
] as const;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const SAFE_EXTENSION = /^[A-Za-z0-9]{1,12}$/;
const MAX_DURATION_US = 86_400_000_000;
const OUTCOMES = new Set<DiagnosticOutcome>([
  "ok",
  "cancelled",
  "refused",
  "failed",
  "unavailable",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function closedKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): string | null {
  const additional = Object.keys(value).find((key) => !expected.includes(key));
  return additional ? `${label} has additional key ${additional}` : null;
}

function safeToken(value: unknown, label: string): string | null {
  return typeof value === "string" && SAFE_TOKEN.test(value)
    ? null
    : `${label} must be a bounded opaque token`;
}

function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return undefined;
  const extension = name.slice(dot + 1).toLowerCase();
  return SAFE_EXTENSION.test(extension) ? extension : undefined;
}

/**
 * Retain enough shape to correlate file work without retaining a filename,
 * directory name, home directory, or traversal component.
 */
export function redactLogicalPath(path: string): RedactedLogicalPath {
  const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(path) || /^\\\\/.test(path);
  const unixAbsolute = path.startsWith("/") || path.startsWith("~");
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path);
  const normalized = path.replaceAll("\\", "/");
  const rawSegments = normalized.split("/").filter((segment) => segment.length > 0);
  const traversal = rawSegments.some((segment) => segment === "..");
  const segments = rawSegments.filter((segment) => segment !== "." && segment !== "..");
  const extension = extensionOf(segments.at(-1) ?? "");
  const result: RedactedLogicalPath = {
    scope: windowsAbsolute || unixAbsolute || scheme || traversal ? "redacted" : "project",
    depth: Math.min(segments.length, 255),
    ...(extension ? { extension } : {}),
  };
  return Object.freeze(result);
}

function prepareContext(
  value: unknown,
):
  | { readonly ok: true; readonly value: DiagnosticContext | undefined }
  | { readonly ok: false; readonly problem: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isRecord(value)) return { ok: false, problem: "context must be an object" };
  const keyProblem = closedKeys(value, CONTEXT_KEYS, "context");
  if (keyProblem) return { ok: false, problem: keyProblem };

  const context: Record<string, string | RedactedLogicalPath> = {};
  for (const key of CONTEXT_KEYS.slice(0, 4)) {
    const field = value[key];
    if (field === undefined) continue;
    const problem = safeToken(field, `context.${key}`);
    if (problem) return { ok: false, problem };
    context[key] = field as string;
  }
  if (value.logicalPath !== undefined) {
    if (typeof value.logicalPath !== "string" || value.logicalPath.length > 4_096) {
      return { ok: false, problem: "context.logicalPath must be a bounded string" };
    }
    context.logicalPath = redactLogicalPath(value.logicalPath);
  }
  return {
    ok: true,
    value: Object.keys(context).length > 0 ? Object.freeze(context) : undefined,
  };
}

function preparedBase(
  value: Record<string, unknown>,
  expected: readonly string[],
):
  | { readonly ok: true; readonly value: { operation: string; context?: DiagnosticContext } }
  | { readonly ok: false; readonly problem: string } {
  const keyProblem = closedKeys(value, expected, "diagnostic record");
  if (keyProblem) return { ok: false, problem: keyProblem };
  const operationProblem = safeToken(value.operation, "operation");
  if (operationProblem) return { ok: false, problem: operationProblem };
  const context = prepareContext(value.context);
  if (!context.ok) return context;
  return {
    ok: true,
    value: {
      operation: value.operation as string,
      ...(context.value ? { context: context.value } : {}),
    },
  };
}

function validOutcome(value: unknown): value is DiagnosticOutcome {
  return typeof value === "string" && OUTCOMES.has(value as DiagnosticOutcome);
}

/** Validate the closed privacy boundary before a record reaches native storage. */
export function prepareDiagnosticRecord(value: unknown): DiagnosticPreparation {
  if (!isRecord(value)) return { ok: false, problem: "diagnostic record must be an object" };

  switch (value.recordType) {
    case "event": {
      const base = preparedBase(value, [...BASE_KEYS, "outcome"]);
      if (!base.ok) return base;
      if (!validOutcome(value.outcome)) {
        return { ok: false, problem: "event outcome is unsupported" };
      }
      return {
        ok: true,
        value: Object.freeze({
          recordType: "event",
          ...base.value,
          outcome: value.outcome,
        }),
      };
    }
    case "span": {
      const base = preparedBase(value, [
        ...BASE_KEYS,
        "traceId",
        "spanId",
        "parentSpanId",
        "durationUs",
        "outcome",
      ]);
      if (!base.ok) return base;
      for (const key of ["traceId", "spanId"] as const) {
        const problem = safeToken(value[key], key);
        if (problem) return { ok: false, problem };
      }
      if (value.parentSpanId !== undefined) {
        const problem = safeToken(value.parentSpanId, "parentSpanId");
        if (problem) return { ok: false, problem };
      }
      if (
        typeof value.durationUs !== "number" ||
        !Number.isSafeInteger(value.durationUs) ||
        value.durationUs < 0 ||
        value.durationUs > MAX_DURATION_US
      ) {
        return { ok: false, problem: "durationUs must be a bounded non-negative integer" };
      }
      if (!validOutcome(value.outcome)) {
        return { ok: false, problem: "span outcome is unsupported" };
      }
      return {
        ok: true,
        value: Object.freeze({
          recordType: "span",
          ...base.value,
          traceId: value.traceId as string,
          spanId: value.spanId as string,
          ...(value.parentSpanId ? { parentSpanId: value.parentSpanId as string } : {}),
          durationUs: value.durationUs,
          outcome: value.outcome,
        }),
      };
    }
    case "error": {
      const base = preparedBase(value, [...BASE_KEYS, "code"]);
      if (!base.ok) return base;
      const codeProblem = safeToken(value.code, "code");
      if (codeProblem) return { ok: false, problem: codeProblem };
      return {
        ok: true,
        value: Object.freeze({ recordType: "error", ...base.value, code: value.code as string }),
      };
    }
    case "state": {
      const base = preparedBase(value, [...BASE_KEYS, "from", "to"]);
      if (!base.ok) return base;
      for (const key of ["from", "to"] as const) {
        const problem = safeToken(value[key], key);
        if (problem) return { ok: false, problem };
      }
      return {
        ok: true,
        value: Object.freeze({
          recordType: "state",
          ...base.value,
          from: value.from as string,
          to: value.to as string,
        }),
      };
    }
    default:
      return { ok: false, problem: "diagnostic recordType is unsupported" };
  }
}

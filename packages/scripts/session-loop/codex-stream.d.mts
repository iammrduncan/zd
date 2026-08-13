interface CodexEvent {
  error?: { message?: string };
  item?: {
    changes?: Array<{ path?: string }>;
    command?: string;
    message?: string;
    name?: string;
    query?: string;
    server?: string;
    status?: string;
    summary?: unknown;
    text?: string;
    tool?: string;
    type?: string;
  };
  message?: string;
  type?: string;
}

interface CodexEventDescription {
  activity?: string;
  finalMessage?: string;
  markdown?: string;
}

export function describeCodexEvent(event: CodexEvent): CodexEventDescription;

export function runCodex(
  prompt: string,
  options: Record<string, unknown>,
): Promise<{ code: number; finalMessage: string; signal: NodeJS.Signals | null }>;

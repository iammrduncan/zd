export function parseParentPid(status: string): number | null;
export function isWrapperHostCommandLine(source: { toString(): string }): boolean;

export function parseTcpListeners(table: string, ownedInodes: ReadonlySet<string>): number[];

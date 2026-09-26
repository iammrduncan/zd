export interface MacosProcess {
  readonly command: string;
  readonly parentPid: number;
  readonly pid: number;
}

export function isWrapperHostCommand(command: string, executable: string): boolean;
export function parseProcessTable(source: string): MacosProcess[];
export function parseLsofListeners(source: string): number[];

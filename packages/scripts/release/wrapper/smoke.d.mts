export interface InstalledCounts {
  readonly console: number;
  readonly desktop: number;
  readonly host: number;
}

export interface InstalledWrapperSmokeOptions {
  readonly smokeRoot: string;
  readonly desktopPath: string;
  readonly consolePath: string;
  readonly projectOne: string;
  readonly projectTwo: string;
  readonly environmentFor: (scenario: string) => NodeJS.ProcessEnv;
  readonly directHostChild: (parentPid: number) => Promise<number | undefined>;
  readonly listenerFor: (processId: number) => Promise<number | undefined>;
  readonly installedCounts: () => Promise<InstalledCounts>;
  readonly running: (processId: number) => boolean;
}

export function parseSmokeReport(source: string, expectedPhase: string): Record<string, unknown>;
export function retainedHostObservation(
  expectedPid: number,
  observedPid: number | undefined,
): boolean | undefined;
export function runInstalledWrapperSmoke(options: InstalledWrapperSmokeOptions): Promise<void>;

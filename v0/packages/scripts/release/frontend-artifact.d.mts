export interface PackagedFrontendSummary {
  readonly assetBytes: number;
  readonly assetFiles: number;
}

export function regularFilesUnder(root: string): Promise<string[]>;
export function relativeFiles(root: string, files: readonly string[]): string[];
export function verifyPackagedFrontend(
  expectedAssets: string,
  installedAssets: string,
): Promise<PackagedFrontendSummary>;

export interface VerifyReleaseDownloadsOptions {
  readonly directory: string;
  readonly version: string;
}

export interface VerifyReleaseDownloadsSummary {
  readonly artifacts: readonly string[];
  readonly checksums: number;
}

export function verifyReleaseDownloads(
  options: VerifyReleaseDownloadsOptions,
): Promise<VerifyReleaseDownloadsSummary>;

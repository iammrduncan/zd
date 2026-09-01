export interface LinuxInstallRootOptions {
  readonly expectedAssets: string;
  readonly installRoot: string;
}

export interface LinuxInstallRootSummary {
  readonly assetBytes: number;
  readonly assetFiles: number;
  readonly executables: readonly ["usr/bin/zd", "usr/bin/zd-desktop"];
}

export function verifyLinuxInstallRoot(
  options: LinuxInstallRootOptions,
): Promise<LinuxInstallRootSummary>;

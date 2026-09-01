export interface MacosAppBundleOptions {
  readonly appPath: string;
  readonly expectedAssets: string;
}

export interface MacosAppBundleSummary {
  readonly assetBytes: number;
  readonly assetFiles: number;
  readonly executables: readonly ["Contents/MacOS/zd-desktop", "Contents/Resources/bin/zd"];
}

export function verifyMacosAppBundle(
  options: MacosAppBundleOptions,
): Promise<MacosAppBundleSummary>;

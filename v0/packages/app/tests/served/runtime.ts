import { basename, isAbsolute, join, resolve } from "node:path";

interface ExecutableOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly platform: string;
  readonly repositoryRoot: string;
}

export function resolveServedHostExecutable({
  environment,
  platform,
  repositoryRoot,
}: ExecutableOptions): string {
  const extension = platform === "win32" ? ".exe" : "";
  const expectedName = `zd${extension}`;
  const overridden = environment.ZD_SERVE_EXECUTABLE;
  if (overridden !== undefined) {
    if (!isAbsolute(overridden) || basename(overridden) !== expectedName) {
      throw new Error("ZD_SERVE_EXECUTABLE must be an absolute path to zd");
    }
    return resolve(overridden);
  }
  return resolve(join(repositoryRoot, "target", "debug", expectedName));
}

export function servedHostEnvironment(
  environment: NodeJS.ProcessEnv,
  stateRoot: string,
  platform: string,
): NodeJS.ProcessEnv {
  return {
    ...environment,
    ...(platform === "darwin" ? { HOME: stateRoot } : {}),
    XDG_CONFIG_HOME: stateRoot,
    ZD_TEST_STATE_DIR: stateRoot,
  };
}

export function servedHostStateDirectory(
  environment: Readonly<Record<string, string | undefined>>,
  stateRoot: string,
  platform: string,
): string {
  if (environment.ZD_SERVE_EXECUTABLE === undefined) return stateRoot;
  if (platform === "darwin") {
    return join(stateRoot, "Library", "Application Support", "com.zensuite.zd");
  }
  return join(stateRoot, "com.zensuite.zd");
}

export function servedHostTestTimeout(
  environment: Readonly<Record<string, string | undefined>>,
): number {
  return environment.ZD_SERVE_EXECUTABLE === undefined ? 30_000 : 60_000;
}

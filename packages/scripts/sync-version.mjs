import console from "node:console";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import process from "node:process";

const root = resolve(process.cwd());
const checkOnly = process.argv.includes("--check");
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function replaceCargoPackageVersion(source, header, name, version) {
  const start = source.indexOf(`${header}\n`);
  if (start === -1) throw new Error(`missing ${header} section`);

  let cursor = start;
  while (cursor !== -1) {
    const next = source.indexOf(`\n${header}\n`, cursor + header.length);
    const end = next === -1 ? source.length : next + 1;
    const section = source.slice(cursor, end);
    if (section.includes(`name = "${name}"`)) {
      if (!/^version = "[^"]+"$/m.test(section)) {
        throw new Error(`${header} section for ${name} has no version`);
      }
      const updated = section.replace(/^version = "[^"]+"$/m, `version = "${version}"`);
      return source.slice(0, cursor) + updated + source.slice(end);
    }
    cursor = next === -1 ? -1 : next + 1;
  }

  throw new Error(`missing ${header} section for ${name}`);
}

const packagePath = resolve(root, "package.json");
const manifest = readJson(packagePath);
const version = manifest.version;
if (typeof version !== "string" || !semver.test(version)) {
  console.error("package.json must contain a valid semantic version");
  process.exit(1);
}

const packageLockPath = resolve(root, "package-lock.json");
const packageLock = readJson(packageLockPath);
packageLock.version = version;
if (!packageLock.packages?.[""]) throw new Error("package-lock.json has no root package");
packageLock.packages[""].version = version;

const cargoManifestPath = resolve(root, "packages/tauri/Cargo.toml");
const cargoLockPath = resolve(root, "packages/tauri/Cargo.lock");
const tauriPath = resolve(root, "packages/tauri/tauri.conf.json");
const tauri = readJson(tauriPath);
tauri.version = "../../package.json";

const updates = [
  [packageLockPath, formatJson(packageLock)],
  [
    cargoManifestPath,
    replaceCargoPackageVersion(readFileSync(cargoManifestPath, "utf8"), "[package]", "zd", version),
  ],
  [
    cargoLockPath,
    replaceCargoPackageVersion(readFileSync(cargoLockPath, "utf8"), "[[package]]", "zd", version),
  ],
  [tauriPath, formatJson(tauri)],
];

const drift = updates.filter(([path, contents]) => readFileSync(path, "utf8") !== contents);

if (checkOnly) {
  if (drift.length > 0) {
    const paths = drift.map(([path]) => relative(root, path)).join(", ");
    console.error(`release version metadata is out of sync: ${paths}`);
    process.exit(1);
  }
  console.log(`release version ${version} is synchronized`);
} else if (drift.length === 0) {
  console.log(`release version ${version} was already synchronized`);
} else {
  for (const [path, contents] of drift) {
    writeFileSync(path, contents);
    console.log(`updated ${relative(root, path)} to ${version}`);
  }
}

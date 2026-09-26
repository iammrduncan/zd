import console from "node:console";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const tag = process.argv[2];
if (!tag) {
  console.error("release tag is required");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
const expected = `v${manifest.version}`;

if (tag !== expected) {
  console.error(`refusing release ${tag}: expected ${expected} from package.json`);
  process.exit(1);
}

console.log(`release tag ${tag} matches package.json`);

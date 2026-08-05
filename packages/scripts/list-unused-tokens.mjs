#!/usr/bin/env node

import console from "node:console";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const SOURCE_PATH = resolve("packages/app/src");
const TOKENS_PATH = join(SOURCE_PATH, "design/tokens.css");

function cssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.isFile() && entry.name.endsWith(".css") ? [path] : [];
  });
}

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function listUnusedTokens() {
  const tokenSource = withoutComments(readFileSync(TOKENS_PATH, "utf8"));
  const defined = [
    ...new Set([...tokenSource.matchAll(/^\s*(--[\w-]+):/gm)].map((match) => match[1])),
  ].sort();
  const consumed = new Set(
    cssFiles(SOURCE_PATH).flatMap((path) => {
      const source = withoutComments(readFileSync(path, "utf8"));
      return [...source.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]);
    }),
  );
  const unused = defined.filter((token) => !consumed.has(token));

  if (unused.length === 0) {
    console.log(`All ${defined.length} design tokens are consumed by a stylesheet.`);
    return;
  }

  const verb = unused.length === 1 ? "is" : "are";
  console.log(
    `${unused.length} of ${defined.length} design tokens ${verb} not consumed by a stylesheet:`,
  );
  for (const token of unused) console.log(`  ${token}`);
}

try {
  listUnusedTokens();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`list-unused-tokens: ${message}`);
  process.exitCode = 1;
}

import { expect, test } from "@playwright/test";

import { sameColour } from "../colour";

// Finding F08: "Multiline fenced code blocks do not form coherent code sections…
// A fenced block must render as a distinct, readable code passage and use
// language-appropriate syntax highlighting when a language is declared."
//
// The plane half already held — editor-blocks.spec.ts compares it to the reader's.
// This is the highlighting half, and DESIGN.md §5.2 fixes the inventory: Rust only,
// three categories, "an absent or unknown language remains honest monospace text
// rather than receiving misleading language colour".

test.beforeEach(async ({ page }) => {
  // 9000 is headroom, not a fit. The fixture is ~3700px and grows every time a
  // construct is added; a viewport that merely fitted has silently stopped
  // rendering the bottom of the document four times now, each time failing specs
  // that had nothing to do with the change. A headless viewport costs nothing, so
  // this buys years rather than one more construct. The proper fix — scroll until
  // the wanted line is built — is a filed task.
  await page.setViewportSize({ width: 1100, height: 9000 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  /*
   * Wait for the decoration, not just for the first heading.
   *
   * Lezer parses incrementally, so a construct near the end of a long document is
   * on screen as plain text for a moment before its decoration lands. Waiting on
   * `.md-line-h1` says nothing about the last paragraph — and once the fixture
   * passed ~4000px that gap started failing these specs intermittently.
   */
  await page.locator(".md-syn-keyword").first().waitFor();
});

test("a declared rust block colours its three categories", async ({ page }) => {
  const found = await page.evaluate(() => ({
    keyword: document.querySelectorAll(".md-editor .md-syn-keyword").length,
    string: document.querySelectorAll(".md-editor .md-syn-string").length,
    comment: document.querySelectorAll(".md-editor .md-syn-comment").length,
  }));

  // §5.2 names exactly these three and no more.
  expect(found.keyword, "no keywords were classified").toBeGreaterThan(0);
  expect(found.string, "no strings were classified").toBeGreaterThan(0);
  expect(found.comment, "no comments were classified").toBeGreaterThan(0);
});

test("the three categories are the reader's own colours", async ({ page }) => {
  // Caret in the fence, so the block is the focus target and its categories show
  // their resting colours. A span on a dimmed line resolves to
  // `--focus-context-*` and is *correct* to do so, which would make this compare
  // the wrong pair of values.
  await page.locator(".md-line-code", { hasText: "fn read" }).first().click();
  await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    for (let i = 0; i < 20; i += 1) await frame();
  });

  const editing = await page.evaluate(() => {
    const read = (cls: string) => {
      const node = document.querySelector<HTMLElement>(`.cm-line[data-focus="target"] .${cls}`);
      return node ? getComputedStyle(node).color : null;
    };
    return {
      keyword: read("md-syn-keyword"),
      string: read("md-syn-string"),
      comment: read("md-syn-comment"),
    };
  });

  const tokens = await page.evaluate(() => {
    const resolve = (name: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    return {
      keyword: resolve("--syntax-keyword"),
      string: resolve("--syntax-string"),
      comment: resolve("--syntax-comment"),
    };
  });

  // §5.2: colour comes "through the active DesignSystem… never with miniapp-local
  // colours". The editor highlights with CodeMirror and the reader with Shiki, so
  // the only thing keeping them the same passage is that both resolve to these
  // three tokens — which is worth asserting rather than assuming.
  for (const category of ["keyword", "string", "comment"] as const) {
    expect(editing[category], `${category} was not classified`).not.toBeNull();
    expect(
      sameColour(editing[category]!, tokens[category]),
      `${category} is not --syntax-${category}`,
    ).toBe(true);
  }
});

test("an undeclared or unsupported language stays honest monospace", async ({ page }) => {
  const shell = await page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>(".md-line-code")].find((el) =>
      el.textContent?.includes("npm run dev"),
    );
    return line
      ? { classified: line.querySelectorAll("[class*='md-syn-']").length, text: line.textContent }
      : null;
  });

  // The fixture's `sh` block. §5.2: "every other language hint, including
  // `mermaid`, remains plain code" — misleading colour is worse than none.
  expect(shell, "the shell block was not rendered").not.toBeNull();
  expect(shell!.classified, "an unsupported language received colour").toBe(0);
});

test("dimming a code block keeps its categories distinguishable", async ({ page }) => {
  await page.locator(".cm-line", { hasText: "A paragraph here should be" }).first().click();
  await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    for (let i = 0; i < 20; i += 1) await frame();
  });

  const dimmed = await page.evaluate(() => {
    const colours = ["md-syn-keyword", "md-syn-string", "md-syn-comment"].map((cls) => {
      const node = document.querySelector<HTMLElement>(`.cm-line[data-focus="context"] .${cls}`);
      return node ? getComputedStyle(node).color : null;
    });
    return colours;
  });

  // §5.2: "syntax remains distinguishable at the warmest setting and without
  // colour", and §4.4 dims context without flattening it — a dimmed code block is
  // still a code block, so the three categories must not collapse into one ink.
  expect(
    dimmed.every((c) => c !== null),
    "no dimmed code was found",
  ).toBe(true);
  expect(new Set(dimmed).size, "the categories collapsed when dimmed").toBe(3);
});

test("the fence markers and language tag are not drawn", async ({ page }) => {
  const onScreen = await page.evaluate(
    () => document.querySelector<HTMLElement>(".cm-content")!.innerText,
  );

  // DESIGN.md §5.2: "Its opening and closing fences and the declared language tag
  // are not drawn once the block is formed; under Raw Mode they reappear and join
  // that same plane, font, and 22 px rhythm as the code between them."
  expect(onScreen, "a fence marker is still on screen").not.toContain("```");
  expect(onScreen, "the language tag is still on screen").not.toContain("```rust");
  // The code itself survived.
  expect(onScreen).toContain("fn read(path: &str)");
  expect(onScreen).toContain("npm run dev");
});

test("hiding the fence leaves no blank rows of plane", async ({ page }) => {
  const rows = await page.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>(".md-line-code")];
    return all.map((line) => ({
      text: line.textContent ?? "",
      height: line.getBoundingClientRect().height,
    }));
  });

  // Replacing the fence characters inline would leave the *line* behind — an empty
  // row still carrying `surface.code`, so the block would gain a blank band top and
  // bottom. §5.2 wants "one continuous rectangular plane spanning the full code
  // measure and every row", and a blank row is not one of its rows.
  expect(rows.length, "no code rows at all").toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.text.trim(), `a blank code row survived (${row.height}px)`).not.toBe("");
  }
});

test("the document still contains its fences", async ({ page }) => {
  const text = await page.evaluate(() => window.zdEditor!.text());

  // Same guard as links and tables: what is drawn changes, what would be written
  // does not. §6.3 saves what is on screen, so a decoration that ate the fence
  // would turn a code block into prose on the next cmd+s.
  expect(text, "the source lost its language tag").toContain("```rust");
  expect(text, "the source lost its closing fence").toContain("```\n");
});

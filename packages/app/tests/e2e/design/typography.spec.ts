import { expect, test } from "@playwright/test";

// The DESIGN.md §5.2 type-role table, verbatim, in logical pixels at 1x.
// Headings are derived in CSS from prose size x ratio x heading scale, so this
// needs a real engine to resolve the calc() chain — hence Playwright and not
// vitest. Sizes are compared to within 0.05px because the ratios are rounded.
const TYPE_ROLES = [
  { role: "prose", size: 17, line: 28 },
  { role: "prose-emphasis", size: 17, line: 28 },
  { role: "h1", size: 30, line: 38 },
  { role: "h2", size: 24, line: 32 },
  { role: "h3", size: 22, line: 31.9 },
  { role: "h4", size: 20, line: 29.5 },
  { role: "h5", size: 18, line: 27.5 },
  { role: "h6", size: 16, line: 25.4 },
  { role: "code", size: 14, line: 22 },
  { role: "inline-code", size: 15, line: 24 },
  { role: "navigation", size: 12.5, line: 22 },
  { role: "supporting", size: 13, line: 20 },
  { role: "action", size: 15, line: 24 },
];

interface Measurement {
  size: number;
  line: number;
  family: string;
}

/**
 * Resolve roles by applying their tokens to a probe element. Reading the custom
 * property directly would return the unresolved `calc(...)` token sequence;
 * assigning it to font-size forces the engine to compute real pixels.
 *
 * Returns a lookup that throws on an unmeasured role, so a typo in a test reads
 * as a named failure rather than as `undefined`.
 */
async function measureRoles(page: import("@playwright/test").Page, roles: string[]) {
  const measured = await page.evaluate((names) => {
    const probe = document.createElement("div");
    document.body.append(probe);

    const out: Record<string, Measurement> = {};
    for (const name of names) {
      probe.style.fontSize = `var(--type-${name}-size)`;
      probe.style.lineHeight = `var(--type-${name}-line)`;
      probe.style.fontFamily = `var(--type-${name}-family)`;
      const computed = getComputedStyle(probe);
      out[name] = {
        size: parseFloat(computed.fontSize),
        line: parseFloat(computed.lineHeight),
        family: computed.fontFamily,
      };
    }

    probe.remove();
    return out;
  }, roles);

  return (role: string): Measurement => {
    const hit = measured[role];
    if (!hit) throw new Error(`role "${role}" was not measured`);
    return hit;
  };
}

test("every DESIGN.md 5.2 type role resolves to its specified size and line", async ({ page }) => {
  await page.goto("/");
  const measured = await measureRoles(
    page,
    TYPE_ROLES.map((r) => r.role),
  );

  for (const { role, size, line } of TYPE_ROLES) {
    expect(measured(role).size, `--type-${role}-size`).toBeCloseTo(size, 1);
    expect(measured(role).line, `--type-${role}-line`).toBeCloseTo(line, 1);
  }
});

test("headings scale with prose size and keep their ratios", async ({ page }) => {
  await page.goto("/");

  // §5.2: "Changing prose size retains the ratios."
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--type-prose-size", "22px"),
  );
  const measured = await measureRoles(page, ["prose", "h1", "h2", "h6"]);

  const prose = measured("prose").size;
  expect(prose).toBeCloseTo(22, 1);
  expect(measured("h1").size / prose).toBeCloseTo(30 / 17, 2);
  expect(measured("h2").size / prose).toBeCloseTo(24 / 17, 2);
  expect(measured("h6").size / prose).toBeCloseTo(16 / 17, 2);
});

test("heading scale moves headings without touching body size", async ({ page }) => {
  await page.goto("/");

  // §5.2: "changing heading scale never changes body size."
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--type-heading-scale", "1.25"),
  );
  const measured = await measureRoles(page, ["prose", "code", "h1", "h3"]);

  expect(measured("prose").size).toBeCloseTo(17, 1);
  expect(measured("code").size).toBeCloseTo(14, 1);
  expect(measured("h1").size).toBeCloseTo(30 * 1.25, 1);
  expect(measured("h3").size).toBeCloseTo(22 * 1.25, 1);
});

test("code and navigation roles select the mono family, prose roles the Quattro", async ({
  page,
}) => {
  await page.goto("/");
  const measured = await measureRoles(page, ["prose", "h1", "code", "inline-code", "navigation"]);

  for (const role of ["code", "inline-code", "navigation"]) {
    expect(measured(role).family, role).toContain("iA Writer Mono");
  }
  for (const role of ["prose", "h1"]) {
    expect(measured(role).family, role).toContain("iA Writer Quattro");
  }
});

import { expect, test } from "@playwright/test";

// The @font-face contract from DESIGN.md §5.1. The declarations live in
// src/design/fonts.css; these tests prove the declarations do what §5.1 says,
// which is the half a CSS file cannot assert about itself.
//
// The manifest is exact — four faces, and no Bold Italic among them.
const MANIFEST = [
  { file: "iAWriterQuattroV.ttf", family: "iA Writer Quattro", weight: "400", style: "normal" },
  {
    file: "iAWriterQuattroV-Italic.ttf",
    family: "iA Writer Quattro",
    weight: "400",
    style: "italic",
  },
  {
    file: "iAWriterQuattroS-Bold.ttf",
    family: "iA Writer Quattro",
    weight: "700",
    style: "normal",
  },
  { file: "iAWriterMonoS-Regular.ttf", family: "iA Writer Mono", weight: "400", style: "normal" },
];

interface Run {
  label: string;
  text: string;
  family: string;
  size: number;
  weight?: number;
  style?: string;
}

const QUATTRO = { family: "iA Writer Quattro", size: 17 };
const MONO = { family: "iA Writer Mono", size: 14 };

/**
 * Width of a string as actually shaped by the engine.
 *
 * Deliberately a DOM element and deliberately longhand properties. Canvas 2D
 * applies synthetic bold regardless of CSS, and the `font` shorthand resets
 * font-synthesis to its initial enabled value — either one would quietly defeat
 * the no-synthesis tests below.
 */
async function measureText(page: import("@playwright/test").Page, runs: Run[]) {
  const widths = await page.evaluate(async (specs) => {
    // A face the page has not used yet stays "unloaded" and document.fonts.ready
    // returns immediately, so measuring without this would silently measure the
    // platform fallback — which kerns, and would make the tests below lie.
    await Promise.all(
      specs.map((spec) =>
        document.fonts.load(
          `${spec.style ?? "normal"} ${spec.weight ?? 400} ${spec.size}px "${spec.family}"`,
        ),
      ),
    );
    await document.fonts.ready;

    const probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.whiteSpace = "pre";
    probe.style.visibility = "hidden";
    document.body.append(probe);

    const out: Record<string, number> = {};
    for (const spec of specs) {
      probe.style.fontFamily = `"${spec.family}"`;
      probe.style.fontSize = `${spec.size}px`;
      probe.style.fontWeight = String(spec.weight ?? 400);
      probe.style.fontStyle = spec.style ?? "normal";
      probe.textContent = spec.text;
      out[spec.label] = probe.getBoundingClientRect().width;
    }

    probe.remove();
    return out;
  }, runs);

  return (label: string): number => {
    const hit = widths[label];
    if (hit === undefined) throw new Error(`run "${label}" was not measured`);
    return hit;
  };
}

/**
 * Render each run and return its pixels.
 *
 * Advance widths cannot distinguish Quattro's Regular from its Bold — duospace
 * gives them the same metrics — so proving which face was selected means
 * comparing outlines.
 *
 * One probe at fixed geometry, restyled between shots, rather than a column of
 * spans. Stacked spans sit at different sub-pixel offsets (y = 8, 35.98, 63.97)
 * and an element at an integer offset rasterises differently from one at a
 * fractional offset, so identical glyphs compare unequal and the whole method
 * quietly reports differences that are not there. Holding position constant is
 * what makes a byte comparison mean "different outlines".
 */
async function renderRuns(page: import("@playwright/test").Page, runs: Run[]) {
  await page.goto("/");

  await page.evaluate(async (specs) => {
    await Promise.all(
      specs.map((spec) =>
        document.fonts.load(
          `${spec.style ?? "normal"} ${spec.weight ?? 400} ${spec.size}px "${spec.family}"`,
        ),
      ),
    );
    await document.fonts.ready;

    const probe = document.createElement("div");
    probe.id = "font-probe";
    // Fixed box at an integer origin, so every shot crops the same pixels.
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:400px;height:48px;z-index:9999;" +
      "background:#fff;color:#000;white-space:pre;overflow:hidden";
    document.body.append(probe);
  }, runs);

  const shots: Record<string, Buffer> = {};
  for (const run of runs) {
    await page.evaluate((spec) => {
      const probe = document.getElementById("font-probe")!;
      probe.textContent = spec.text;
      probe.style.fontFamily = `"${spec.family}"`;
      probe.style.fontSize = `${spec.size}px`;
      probe.style.fontWeight = String(spec.weight ?? 400);
      probe.style.fontStyle = spec.style ?? "normal";
    }, run);

    shots[run.label] = await page.locator("#font-probe").screenshot();
  }

  return (label: string): Buffer => {
    const hit = shots[label];
    if (!hit) throw new Error(`run "${label}" was not rendered`);
    return hit;
  };
}

test("the probe inherits the no-synthesis rule it depends on", async ({ page }) => {
  await page.goto("/");

  // Every measurement below is only meaningful while synthesis is off, and
  // font-synthesis is inherited from body. If that ever stops being true these
  // tests would silently start measuring synthesized faces.
  const synthesis = await page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const value = getComputedStyle(probe).fontSynthesis;
    probe.remove();
    return value;
  });

  expect(synthesis).toBe("none");
});

test("every face in the DESIGN.md 5.1 manifest actually loads", async ({ page }) => {
  await page.goto("/");

  // `[...document.fonts]` lists *declared* faces even when the file 404s, so
  // status is the claim that matters, not presence. Faces load lazily, so ask
  // for each one first: an unused face reports "unloaded" however healthy it is.
  const loaded = await page.evaluate(async (manifest) => {
    await Promise.all(
      manifest.map((face) =>
        document.fonts.load(`${face.style} ${face.weight} 17px "${face.family}"`),
      ),
    );
    await document.fonts.ready;
    return [...document.fonts].map((f) => `${f.family}/${f.weight}/${f.style}/${f.status}`);
  }, MANIFEST);

  for (const face of MANIFEST) {
    expect(loaded).toContain(`${face.family}/${face.weight}/${face.style}/loaded`);
  }
  expect(loaded, "the manifest is exact — no extra faces").toHaveLength(MANIFEST.length);
});

test("every face is served as a real TrueType file", async ({ page, request }) => {
  await page.goto("/");

  for (const { file } of MANIFEST) {
    const response = await request.get(`/fonts/${file}`);
    expect(response.status(), file).toBe(200);

    // TrueType outlines start with the 0x00010000 sfnt version tag.
    const magic = (await response.body()).subarray(0, 4);
    expect([...magic], file).toEqual([0x00, 0x01, 0x00, 0x00]);
  }
});

test("bold keeps the duospace advance so weight never reflows text", async ({ page }) => {
  await page.goto("/");

  // Quattro is duospace: the Bold face carries the Regular's advance widths, so
  // emboldening a run cannot change where anything after it sits. This is also
  // why width alone cannot tell Bold from Regular — see the outline test below.
  const width = await measureText(page, [
    { label: "regular", text: "Handgloves", ...QUATTRO, weight: 400 },
    { label: "bold", text: "Handgloves", ...QUATTRO, weight: 700 },
    { label: "italic", text: "Handgloves", ...QUATTRO, weight: 400, style: "italic" },
  ]);

  expect(width("bold")).toBeCloseTo(width("regular"), 1);
  expect(width("italic")).toBeCloseTo(width("regular"), 1);
});

test("bold draws the shipped Bold outlines rather than a substituted Regular", async ({ page }) => {
  // §5.1: the static Bold face reports an OS/2 weight of 400 despite its bold
  // outlines. Loaders "must not substitute the Regular face, infer weight from
  // the incorrect field, modify the font bytes, or synthesize a stroke." Since
  // the advance widths match, only the rendered pixels can tell them apart.
  const shot = await renderRuns(page, [
    { label: "regular", text: "Handgloves", ...QUATTRO, weight: 400 },
    { label: "bold", text: "Handgloves", ...QUATTRO, weight: 700 },
  ]);

  expect(shot("bold").equals(shot("regular")), "bold fell back to the Regular outlines").toBe(
    false,
  );
});

test("bold italic falls back to the drawn italic instead of synthesizing one", async ({ page }) => {
  // §5.1: "A role that requires a face not present in this manifest must fall
  // back honestly rather than synthesize it." This probes raw font matching,
  // below the semantic markdown rule that resolves nested strong and emphasis
  // to upright Bold. No Bold Italic ships, so a raw bold italic request must
  // render as the drawn 400 italic, pixel for pixel — any stroke expansion or
  // faux oblique would change those pixels — and must not resolve to upright Bold.
  const shot = await renderRuns(page, [
    { label: "italic", text: "Handgloves", ...QUATTRO, weight: 400, style: "italic" },
    { label: "bold-italic", text: "Handgloves", ...QUATTRO, weight: 700, style: "italic" },
    { label: "bold", text: "Handgloves", ...QUATTRO, weight: 700 },
  ]);

  expect(shot("bold-italic").equals(shot("italic")), "a bold italic was synthesized").toBe(true);
  expect(shot("bold-italic").equals(shot("bold")), "bold italic lost its italic").toBe(false);
});

test("the variable faces stay pinned and never produce an unshipped weight", async ({ page }) => {
  // The V faces carry a wght 400..700 axis, so a requested weight can be
  // interpolated off that axis into a face the manifest does not ship. DESIGN.md
  // §5.2 forbids simulating "an unshipped 500-weight action face", and §5.1
  // requires an absent face to "fall back honestly". Every intermediate weight
  // must therefore land exactly on the shipped Regular or the shipped Bold.
  //
  // Compared as pixels, not widths: duospace gives every weight the same
  // advance, so a width check here would pass without proving anything.
  const shot = await renderRuns(page, [
    { label: "regular", text: "Handgloves", ...QUATTRO, weight: 400 },
    { label: "w500", text: "Handgloves", ...QUATTRO, weight: 500 },
    { label: "w600", text: "Handgloves", ...QUATTRO, weight: 600 },
    { label: "bold", text: "Handgloves", ...QUATTRO, weight: 700 },
  ]);

  for (const weight of ["w500", "w600"]) {
    const shipped = shot(weight).equals(shot("regular")) || shot(weight).equals(shot("bold"));
    expect(shipped, `${weight} rendered an interpolated variable instance`).toBe(true);
  }
});

test("duospace pair advances survive shaping", async ({ page }) => {
  await page.goto("/");

  // §5.1: the duospace rhythm "deliberately omits kerning and standard
  // ligatures; the production shaper must preserve those pair advances rather
  // than inventing substitutions." AV and To kern hard in most families, so a
  // kerned pair would come out narrower than the sum of its parts.
  const width = await measureText(page, [
    { label: "A", text: "A", ...QUATTRO },
    { label: "V", text: "V", ...QUATTRO },
    { label: "AV", text: "AV", ...QUATTRO },
    { label: "T", text: "T", ...QUATTRO },
    { label: "o", text: "o", ...QUATTRO },
    { label: "To", text: "To", ...QUATTRO },
  ]);

  expect(width("AV")).toBeCloseTo(width("A") + width("V"), 1);
  expect(width("To")).toBeCloseTo(width("T") + width("o"), 1);
});

test("the mono family holds one advance for every glyph", async ({ page }) => {
  await page.goto("/");

  // Writer Mono is the literal-source face; a fixed advance is the whole point.
  const width = await measureText(page, [
    { label: "i", text: "i", ...MONO },
    { label: "W", text: "W", ...MONO },
    { label: "space", text: " ", ...MONO },
  ]);

  expect(width("W")).toBeCloseTo(width("i"), 1);
  expect(width("space")).toBeCloseTo(width("i"), 1);
});

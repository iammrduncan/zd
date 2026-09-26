/*
 * Reading computed colours back out of the engine.
 *
 * Not a spec file — shared by the specs that compare colours.
 *
 * The reason this exists: a plain declaration computes to `rgb(36, 37, 34)`,
 * but anything that passed through color-mix() computes to
 * `color(srgb 0.141176 0.145098 0.133333)`. The two can be the same colour and
 * never compare equal as strings, and a naive numeric parse reads the second
 * one's 0–1 components as 0–255 — which reports near-black as near-white.
 */

/** Linear-light component to an 8-bit sRGB channel. */
function encode(channel: number): number {
  const clamped = Math.max(0, Math.min(1, channel));
  const gamma = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return gamma * 255;
}

/**
 * Channels as 0–255, from any serialization the engine hands back.
 *
 * Three so far: `rgb(36, 37, 34)` from a plain declaration, `color(srgb 0.14 …)`
 * and `oklab(0.30 …)` from color-mix — the engine picks, and it has changed its
 * mind before. Each has components on a different scale, so reading one as
 * another silently reports near-black as near-white, which is how a dimming test
 * can claim context has *more* contrast than its target. Twice now.
 */
export function channels(colour: string): [number, number, number] {
  const oklab = /^oklab\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(colour);
  if (oklab) {
    const [L, a, b] = [Number(oklab[1]), Number(oklab[2]), Number(oklab[3])];
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ];
  }

  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(colour);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];

  const parts = colour
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number);
  return [parts[0]!, parts[1]!, parts[2]!];
}

/** True when two colours are the same paint, whatever form they arrived in. */
export function sameColour(a: string, b: string): boolean {
  const [left, right] = [channels(a), channels(b)];
  return left.every((value, i) => Math.abs(value - right[i]!) < 1);
}

/** WCAG 2.1 relative luminance. */
export function luminance(colour: string): number {
  const linear = channels(colour).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

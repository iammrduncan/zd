import { describe, expect, it } from "vitest";

import { warmRgb } from "@/design/warmth";

describe("appearance warmth", () => {
  it("is an exact identity at zero and a luminance-retaining transform above zero", () => {
    const source = [90, 120, 180] as const;
    expect(warmRgb(source, 0)).toBe(source);
    const warmed = warmRgb(source, 1);
    expect(warmed).not.toEqual(source);
    expect(warmed[2]).toBeLessThan(source[2]);
    const luminance = (rgb: readonly number[]) =>
      rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
    expect(Math.abs(luminance(warmed) - luminance(source))).toBeLessThan(8);
  });
});

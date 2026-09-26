const COLOUR_ROLES = [
  "--surface-canvas",
  "--surface-sidebar",
  "--surface-transient",
  "--surface-selection",
  "--surface-code",
  "--surface-diff-added",
  "--surface-diff-deleted",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--text-link",
  "--line-quiet",
  "--line-focus",
  "--state-added",
  "--state-changed",
  "--state-deleted",
  "--state-ignored",
  "--state-error",
  "--state-waiting",
  "--state-busy",
  "--state-idle",
  "--syntax-keyword",
  "--syntax-type",
  "--syntax-function",
  "--syntax-string",
  "--syntax-number",
  "--syntax-comment",
  "--syntax-punctuation",
] as const;

interface AppliedRole {
  originalInline: string;
  warmedInline: string;
}

const applied = new WeakMap<HTMLElement, Map<string, AppliedRole>>();

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function encoded(channel: number): number {
  const value = Math.min(1, Math.max(0, channel));
  return Math.round(
    255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055),
  );
}

/** Warm an sRGB semantic colour in linear light while retaining its luminance. */
export function warmRgb(
  rgb: readonly [number, number, number],
  amount: number,
): readonly [number, number, number] {
  const warmth = Math.min(1, Math.max(0, amount));
  if (warmth === 0) return rgb;
  const source = rgb.map(linear) as [number, number, number];
  const adapted: [number, number, number] = [
    source[0],
    source[1] * (1 - warmth * 0.12),
    source[2] * (1 - warmth * 0.32),
  ];
  const luminance = (channels: readonly number[]) =>
    channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  const before = luminance(source);
  const after = luminance(adapted);
  const scale = after > 0 ? before / after : 1;
  return [encoded(adapted[0] * scale), encoded(adapted[1] * scale), encoded(adapted[2] * scale)];
}

function parseRgb(value: string): [number, number, number] | null {
  const match = value.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/u);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Apply warmth to resolved semantic colours; zero restores their exact source values. */
export function applyWarmth(root: HTMLElement, amount: number): void {
  const previous = applied.get(root) ?? new Map<string, AppliedRole>();
  for (const role of COLOUR_ROLES) {
    const remembered = previous.get(role);
    const current = root.style.getPropertyValue(role);
    if (remembered && current === remembered.warmedInline) {
      if (remembered.originalInline) root.style.setProperty(role, remembered.originalInline);
      else root.style.removeProperty(role);
    } else if (remembered && current !== remembered.warmedInline) {
      previous.set(role, { originalInline: current, warmedInline: "" });
    }
  }
  root.style.setProperty("--warmth", String(Math.min(1, Math.max(0, amount))));
  if (amount <= 0) {
    applied.delete(root);
    return;
  }

  const probe = document.createElement("span");
  probe.hidden = true;
  root.append(probe);
  for (const role of COLOUR_ROLES) {
    const originalInline = root.style.getPropertyValue(role);
    probe.style.color = `var(${role})`;
    const rgb = parseRgb(getComputedStyle(probe).color);
    if (!rgb) continue;
    const warmed = warmRgb(rgb, amount);
    const warmedInline = `rgb(${warmed.join(" ")})`;
    previous.set(role, { originalInline, warmedInline });
    root.style.setProperty(role, warmedInline);
  }
  probe.remove();
  applied.set(root, previous);
}

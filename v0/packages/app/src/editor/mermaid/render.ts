import { renderMermaidSVG } from "beautiful-mermaid";

const SAFE_ELEMENTS = new Set([
  "circle",
  "defs",
  "ellipse",
  "g",
  "line",
  "marker",
  "path",
  "polygon",
  "polyline",
  "rect",
  "style",
  "svg",
  "text",
  "tspan",
]);

const SAFE_ATTRIBUTES = new Set(
  [
    "class",
    "cx",
    "cy",
    "d",
    "dy",
    "fill",
    "font-size",
    "font-style",
    "font-weight",
    "height",
    "id",
    "marker-end",
    "markerheight",
    "markerwidth",
    "orient",
    "points",
    "r",
    "refx",
    "refy",
    "rx",
    "ry",
    "stroke",
    "stroke-dasharray",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-width",
    "style",
    "text-anchor",
    "transform",
    "viewbox",
    "width",
    "x",
    "x1",
    "x2",
    "y",
    "y1",
    "y2",
  ].map((name) => name.toLowerCase()),
);

const REMOTE_FONT_IMPORT = /@import\s+url\([^)]*\)\s*;/giu;
const UNSAFE_CSS = /@|expression\s*\(|javascript:|data:|https?:|url\s*\(/iu;
const UNSAFE_VALUE = /javascript:|data:|https?:\/\/|\/\//iu;
const LOCAL_FRAGMENT = /^url\(#[A-Za-z_][\w:.-]*\)$/u;
const CACHE_LIMIT = 64;
const safeMarkup = new Map<string, string | null>();

function diagramKind(source: string): string {
  const declaration = source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%"))
    ?.split(/\s+/u)[0]
    ?.toLowerCase();

  if (declaration === "graph" || declaration === "flowchart") return "flowchart";
  if (declaration?.startsWith("sequencediagram")) return "sequence diagram";
  if (declaration?.startsWith("statediagram")) return "state diagram";
  if (declaration?.startsWith("classdiagram")) return "class diagram";
  if (declaration?.startsWith("erdiagram")) return "entity relationship diagram";
  if (declaration?.startsWith("xychart")) return "chart";
  return "diagram";
}

function remember(source: string, markup: string | null): string | null {
  safeMarkup.delete(source);
  safeMarkup.set(source, markup);
  if (safeMarkup.size > CACHE_LIMIT) safeMarkup.delete(safeMarkup.keys().next().value!);
  return markup;
}

/** Convert renderer output into a deliberately small, inert SVG vocabulary. */
function sanitize(markup: string): string | null {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (parsed.querySelector("parsererror")) return null;
  const root = parsed.documentElement;
  if (root.localName.toLowerCase() !== "svg") return null;

  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (!SAFE_ELEMENTS.has(element.localName.toLowerCase())) return null;

    if (element.localName.toLowerCase() === "style") {
      const css = (element.textContent ?? "").replace(REMOTE_FONT_IMPORT, "").trim();
      if (UNSAFE_CSS.test(css)) return null;
      element.textContent = css;
    }

    for (const attribute of element.getAttributeNames()) {
      const name = attribute.toLowerCase();
      if (name === "xmlns") {
        element.removeAttribute(attribute);
        continue;
      }
      if (!name.startsWith("data-") && !SAFE_ATTRIBUTES.has(name)) return null;
      const value = element.getAttribute(attribute) ?? "";
      if (UNSAFE_VALUE.test(value)) return null;
      if (/url\s*\(/iu.test(value) && !LOCAL_FRAGMENT.test(value.trim())) return null;
    }
  }

  return new XMLSerializer().serializeToString(root);
}

function markupFor(source: string): string | null {
  const cached = safeMarkup.get(source);
  if (cached !== undefined || safeMarkup.has(source)) return cached ?? null;

  try {
    const rendered = renderMermaidSVG(source, {
      bg: "var(--surface-canvas)",
      fg: "var(--text-primary)",
      line: "var(--text-muted)",
      accent: "var(--line-focus)",
      muted: "var(--text-secondary)",
      surface: "var(--surface-sidebar)",
      border: "var(--line-quiet)",
      font: "iA Writer Quattro",
      transparent: true,
      padding: 24,
    });
    return remember(source, sanitize(rendered));
  } catch {
    return remember(source, null);
  }
}

/** Render untrusted Mermaid source as an inert SVG, or return null to keep source visible. */
export function renderMermaidDiagram(source: string): SVGSVGElement | null {
  const markup = markupFor(source);
  if (!markup) return null;

  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  const sourceRoot = parsed.documentElement;
  if (sourceRoot.localName.toLowerCase() !== "svg") return null;
  const svg = document.importNode(sourceRoot, true) as unknown as SVGSVGElement;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Mermaid ${diagramKind(source)}`);
  svg.setAttribute("focusable", "false");
  return svg;
}

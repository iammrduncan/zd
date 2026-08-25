import type { FileResource } from "../../resources";

/** Resolve a Markdown destination without letting it escape the approved project. */
export function markdownResource(document: FileResource, source: string): FileResource | null {
  const pathWithEncoding = source.trim().split(/[?#]/, 1)[0] ?? "";
  if (
    !pathWithEncoding ||
    pathWithEncoding.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(pathWithEncoding)
  ) {
    return null;
  }

  let path: string;
  try {
    path = decodeURIComponent(pathWithEncoding);
  } catch {
    return null;
  }
  if (!path || path.includes("\\") || path.includes("\0")) return null;

  const segments = document.relativePath.split("/").slice(0, -1);
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) return null;
  return { ...document, relativePath: segments.join("/") };
}

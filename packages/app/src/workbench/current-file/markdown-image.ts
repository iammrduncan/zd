import type { Platform } from "@/platform";
import type { FileResource } from "../resources";

/** Resolve Markdown URL syntax without letting a document escape its approved project. */
function imageResource(document: FileResource, source: string): FileResource | null {
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

/** Bridge a document-relative URL to one released browser object URL. */
export function markdownImageResolver(
  platform: Pick<Platform, "readProjectImage">,
  document: FileResource,
) {
  return async (source: string) => {
    const resource = imageResource(document, source);
    if (!resource) return null;
    const image = await platform.readProjectImage(resource);
    const bytes = Uint8Array.from(image.bytes);
    const url = URL.createObjectURL(new Blob([bytes], { type: image.mediaType }));
    return {
      url,
      release: () => URL.revokeObjectURL(url),
    };
  };
}

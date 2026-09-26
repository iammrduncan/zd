import type { Platform } from "@/platform";
import type { FileResource } from "../resources";
import { markdownResource } from "./markdown/resource";

/** Bridge a document-relative URL to one released browser object URL. */
export function markdownImageResolver(
  platform: Pick<Platform, "readProjectImage">,
  document: FileResource,
) {
  return async (source: string) => {
    const resource = markdownResource(document, source);
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

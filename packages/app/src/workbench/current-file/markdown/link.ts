import type { FileResource } from "../../resources";
import type { WorkbenchRuntimeContext } from "../../runtime";
import { markdownResource } from "./resource";

/** Route parser-approved Markdown destinations through the owning workbench boundary. */
export function markdownLinkOpener(
  context: WorkbenchRuntimeContext,
  document: FileResource,
  report: (message: string) => void,
): (href: string) => void {
  return (href) => {
    if (/^https?:\/\//i.test(href)) {
      void context.platform
        .openExternal(href)
        .catch(() => report("Could not open the link in your browser."));
      return;
    }

    const target = markdownResource(document, href);
    if (!target) return;
    void context.state.activateFile(target).then((result) => {
      if (result.status === "refused") report(result.reason);
    });
  };
}

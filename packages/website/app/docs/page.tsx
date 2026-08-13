import type { Metadata } from "next";

import { getPublicDoc } from "@/lib/docs";
import { pageMetadata } from "@/lib/site";

import { DocsPage } from "./_components/document";

const doc = getPublicDoc([]);

export const metadata: Metadata = pageMetadata({
  description: doc?.description ?? "Learn how to install, use, and understand zd md.",
  path: "/docs/",
  title: "Documentation",
});

export default function DocumentationHome() {
  if (!doc) throw new Error("The documentation home is missing");

  return <DocsPage doc={doc} />;
}

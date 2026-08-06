import type { Metadata } from "next";

import { getPublicDoc } from "@/lib/docs";

import { DocsPage } from "./docs-page";

export const metadata: Metadata = { title: "Documentation" };

export default function DocumentationHome() {
  const doc = getPublicDoc([]);
  if (!doc) throw new Error("The documentation home is missing");

  return <DocsPage doc={doc} />;
}

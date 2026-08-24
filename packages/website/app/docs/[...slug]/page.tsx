import type { Metadata } from "next";

import { getPublicDoc, getPublicDocStaticSlugs } from "@/lib/docs";
import { pageMetadata } from "@/lib/site";

import { DocsPage } from "../_components/document";

type Props = { params: Promise<{ slug: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return getPublicDocStaticSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = getPublicDoc(slug);
  if (!doc) return { title: "Documentation" };

  return pageMetadata({
    description: doc.description,
    path: doc.href,
    title: doc.title,
  });
}

export default async function DocumentationPage({ params }: Props) {
  const { slug } = await params;
  const doc = getPublicDoc(slug);
  if (!doc) throw new Error(`Unknown documentation page: ${slug.join("/")}`);

  return <DocsPage doc={doc} />;
}

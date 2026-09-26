import type { MetadataRoute } from "next";

import { getPublicDocs } from "@/lib/docs";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = getPublicDocs().map((doc) => ({
    changeFrequency: "monthly" as const,
    priority: doc.slug.length === 0 ? 0.8 : 0.7,
    url: absoluteUrl(doc.href),
  }));

  return [
    {
      changeFrequency: "monthly",
      priority: 1,
      url: absoluteUrl("/"),
    },
    ...docs,
  ];
}

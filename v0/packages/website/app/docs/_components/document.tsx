import Link from "next/link";

import type { PublicDoc } from "@/lib/docs";
import { getPublicDocs } from "@/lib/docs";

export function DocsPage({ doc }: { doc: PublicDoc }) {
  const navigation = getPublicDocs().filter((item) => item.slug.length > 0);

  return (
    <main className="docs-layout">
      <aside className="docs-sidebar">
        <p className="eyebrow">Documentation</p>
        <Link className={doc.slug.length === 0 ? "active" : ""} href="/docs/">
          Overview
        </Link>
        {navigation.map((item, index) => {
          const startsSection = index === 0 || navigation[index - 1]?.section !== item.section;

          return (
            <div key={item.href}>
              {startsSection ? <h2>{item.section}</h2> : null}
              <Link className={item.href === doc.href ? "active" : ""} href={item.href}>
                {item.title}
              </Link>
            </div>
          );
        })}
      </aside>
      <article className="docs-article" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </main>
  );
}

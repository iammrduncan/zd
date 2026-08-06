import Link from "next/link";
import type { Metadata } from "next";

import commentScreenshot from "../../../docs/user-facing-docs/assets/zd-comments.png";
import readerScreenshot from "../../../docs/user-facing-docs/assets/zd-reader.jpeg";
import { pageMetadata, RELEASE_URL, SITE_DESCRIPTION, softwareApplicationJsonLd } from "@/lib/site";
import { AppPresence } from "./presence";

export const metadata: Metadata = pageMetadata({
  description: SITE_DESCRIPTION,
  path: "/",
});

export default function Home() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <section className="hero">
        <p className="eyebrow">Zen Suite · tool 01</p>
        <h1>
          Read the long thing.
          <br />
          Keep it editable.
        </h1>
        <p className="hero-copy">
          <code>zd md</code> gives Markdown the measure, focus, and calm of a reading
          surface—without splitting your work between a preview and an editor.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href={RELEASE_URL}>
            Download latest release
          </a>
          <Link className="button" href="/docs/">
            Read the docs
          </Link>
        </div>
        <p className="platform-note">Available for macOS and Windows · local files by default</p>
        <AppPresence />
      </section>

      <section className="product" aria-labelledby="product-heading">
        <div className="section-heading">
          <p className="eyebrow">The document is the interface</p>
          <h2 id="product-heading">One surface for reading and writing.</h2>
        </div>
        <figure className="app-frame">
          <img
            src={readerScreenshot.src}
            width={1100}
            height={760}
            alt="zd md showing a repository sidebar and a focused paragraph in README.md"
          />
          <figcaption>
            Folder navigation, rendered Markdown, and the source caret stay together.
          </figcaption>
        </figure>
      </section>

      <section className="features" aria-label="Product highlights">
        <article>
          <span className="feature-number">01</span>
          <h2>Always editable</h2>
          <p>
            Type directly into the rendered source. There is no mode switch and no second document.
          </p>
        </article>
        <article>
          <span className="feature-number">02</span>
          <h2>Attention, directed</h2>
          <p>
            Focus a line, paragraph, or section while the shape of the surrounding document remains.
          </p>
        </article>
        <article>
          <span className="feature-number">03</span>
          <h2>Local by default</h2>
          <p>
            Open ordinary Markdown files and folders. Remote images stay unfetched unless you ask.
          </p>
        </article>
      </section>

      <section className="sidekick" aria-labelledby="sidekick-heading">
        <div className="sidekick-copy">
          <p className="eyebrow">AI sidekick handoff</p>
          <h2 id="sidekick-heading">Give your AI sidekick the exact line.</h2>
          <p>
            Select text, leave an inline instruction, and keep reviewing. zd gathers comments across
            the workspace into one agent-ready <code>zd-feedback.txt</code> file—with paths, line
            ranges, and the quoted source intact.
          </p>
          <Link className="text-link" href="/docs/how-to/review-with-comments/">
            Review with inline comments <span aria-hidden="true">→</span>
          </Link>
        </div>
        <figure className="sidekick-shot">
          <img
            src={commentScreenshot.src}
            width={1100}
            height={760}
            alt="zd md showing an inline comment attached to selected text in a Markdown file"
          />
          <figcaption>
            Precise feedback in the document. Plain-text context for your agent.
          </figcaption>
        </figure>
      </section>

      <section className="detail" aria-labelledby="workspace-heading">
        <div className="detail-copy">
          <p className="eyebrow">Built for real repositories</p>
          <h2 id="workspace-heading">The folder stays visible. The document gets the room.</h2>
          <p>
            Work across Markdown files in stable path order, save safely, and notice external
            changes without handing the app more filesystem access than the workspace needs.
          </p>
          <Link className="text-link" href="/docs/tutorials/first-document/">
            Open your first document <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="detail-shot">
          <img
            src={readerScreenshot.src}
            width={1100}
            height={760}
            alt="A closer view of zd md's workspace sidebar and reading surface"
          />
        </div>
      </section>

      <section className="closing">
        <p className="eyebrow">Small tool. Quiet surface.</p>
        <h2>Stay with the thought.</h2>
        <div className="hero-actions">
          <a className="button button-primary" href={RELEASE_URL}>
            Get zd md
          </a>
          <Link className="button" href="/docs/">
            Browse documentation
          </Link>
        </div>
      </section>
    </main>
  );
}

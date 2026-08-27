import type { Metadata } from "next";

import workbenchScreenshot from "../../../docs/user-facing-docs/assets/zd-workbench.png";
import darkWorkbenchScreenshot from "../../../docs/user-facing-docs/assets/zd-workbench-dark.png";
import draculaWorkbenchScreenshot from "../../../docs/user-facing-docs/assets/zd-workbench-dracula.png";
import sideBySideScreenshot from "../../../docs/user-facing-docs/assets/zd-workbench-side-by-side.png";
import readerScreenshot from "../../../docs/user-facing-docs/assets/zd-reader.jpeg";
import commentsScreenshot from "../../../docs/user-facing-docs/assets/zd-comments.png";
import {
  pageMetadata,
  RELEASE_LABEL,
  RELEASE_URL,
  SITE_DESCRIPTION,
  softwareApplicationJsonLd,
} from "@/lib/site";

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
        <p className="eyebrow">ZenSuite · local Markdown and agent workbench</p>
        <h1>Markdown, rendered and editable.</h1>
        <p className="hero-copy">
          <code>zd</code> is the Markdown reader and editor at the centre of a calm local workbench.
          Read the plan, edit it in place, leave precise feedback, and keep the agents, files, and
          Git work beside it.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href={RELEASE_URL}>
            Download {RELEASE_LABEL}
          </a>
          <a className="button" href="/docs/">
            Read the docs
          </a>
        </div>
        <p className="platform-note">Available for macOS and Windows · local by default</p>
      </section>

      <section className="markdown-story" aria-labelledby="markdown-heading">
        <div className="section-heading">
          <p className="eyebrow">The document is the interface</p>
          <h2 id="markdown-heading">Read Markdown like a document. Edit it where it sits.</h2>
        </div>
        <div className="markdown-showcase">
          <figure>
            <img
              src={readerScreenshot.src}
              width={1440}
              height={900}
              alt="The zd workbench rendering an editable Markdown document with focused reading typography"
            />
            <figcaption>
              Headings, lists, tables, code, local images, and Mermaid render in the same surface
              that owns the caret.
            </figcaption>
          </figure>
          <figure>
            <img
              src={commentsScreenshot.src}
              width={1440}
              height={900}
              alt="A selected Markdown passage with an inline review comment in zd"
            />
            <figcaption>
              Select the exact text, add a comment, and hand a person or agent one generated{" "}
              <code>zd-feedback.txt</code> file.
            </figcaption>
          </figure>
        </div>
        <a className="text-link" href="/docs/tutorials/read-and-review-markdown/">
          Learn the Markdown reader <span aria-hidden="true">→</span>
        </a>
      </section>

      <section className="features" aria-label="Markdown workflow highlights">
        <article>
          <span className="feature-number">01</span>
          <h2>Comment on selected text</h2>
          <p>
            Keep review notes beside the Markdown while <code>zd-feedback.txt</code> collects paths,
            line ranges, quotes, and requested changes.
          </p>
        </article>
        <article>
          <span className="feature-number">02</span>
          <h2>Paste the screenshot</h2>
          <p>
            Paste a clipboard image into Markdown or plain text. zd saves it below{" "}
            <code>docs/screenshots</code> and inserts the relative link.
          </p>
        </article>
        <article>
          <span className="feature-number">03</span>
          <h2>Move without losing context</h2>
          <p>
            Use quick shortcuts to change projects, return to a thread, switch to its file, or hide
            the navigation when the document needs the room.
          </p>
        </article>
      </section>

      <section className="product" aria-labelledby="product-heading">
        <div className="section-heading">
          <p className="eyebrow">One surface, three themes</p>
          <h2 id="product-heading">The reading experience stays calm in every context.</h2>
        </div>
        <figure className="theme-stack">
          <div className="theme-card" data-theme-card="light">
            <span>Current Light</span>
            <img
              src={workbenchScreenshot.src}
              width={1440}
              height={900}
              alt="The Current Light zd workbench with a Codex terminal running beside source code"
            />
          </div>
          <div className="theme-card" data-theme-card="dark">
            <span>Dark</span>
            <img
              src={darkWorkbenchScreenshot.src}
              width={1440}
              height={900}
              alt="The Dark zd workbench with a Codex terminal running beside source code"
            />
          </div>
          <div className="theme-card" data-theme-card="dracula">
            <span>Dracula</span>
            <img
              src={draculaWorkbenchScreenshot.src}
              width={1440}
              height={900}
              alt="The Dracula zd workbench with a Codex terminal running beside source code"
            />
          </div>
          <figcaption>
            Real workbench captures. Theme changes never move the project, thread, or file context.
          </figcaption>
        </figure>
      </section>

      <section className="sidekick" aria-labelledby="sidekick-heading">
        <div className="sidekick-copy">
          <p className="eyebrow">Thread and file context</p>
          <h2 id="sidekick-heading">Stay with the agent and the source.</h2>
          <p>
            A thread remembers its project, worktree, and current file. The paired centre layout
            keeps terminal output beside the selected source while Files and Changes remain on the
            right.
          </p>
          <a className="text-link" href="/docs/how-to/manage-projects-and-threads/">
            Manage projects and threads <span aria-hidden="true">→</span>
          </a>
        </div>
        <figure className="sidekick-shot">
          <img
            src={sideBySideScreenshot.src}
            width={1440}
            height={900}
            alt="The light zd workbench showing a terminal thread beside an editable source file, with project threads on the left and Files on the right"
          />
          <figcaption>Terminal and file context together, with no second project state.</figcaption>
        </figure>
      </section>

      <section className="detail" aria-labelledby="local-heading">
        <div className="detail-copy">
          <p className="eyebrow">Native authority, narrowly held</p>
          <h2 id="local-heading">Your source stays local.</h2>
          <p>
            Native grants constrain project and worktree access. Terminal sessions start only in an
            approved scope, Git operations are fixed and read-only, remote images stay blocked, and
            local diagnostics are opt-in.
          </p>
          <a className="text-link" href="/docs/explanation/architecture/">
            Understand the architecture <span aria-hidden="true">→</span>
          </a>
        </div>
        <div className="detail-shot">
          <img
            src={workbenchScreenshot.src}
            width={1440}
            height={900}
            alt="A closer view of the zd workbench file editor and compact project navigation"
          />
        </div>
      </section>

      <section className="philosophy" aria-labelledby="philosophy-heading">
        <p className="eyebrow">Opinionated on purpose</p>
        <h2 id="philosophy-heading">Built around one daily flow.</h2>
        <p>
          zd is purposefully minimal and matches how I build: read the document, steer the work,
          leave exact feedback, and move to the next project without rebuilding context. It is my
          daily driver. It may not fit everyone, and it is not trying to become a universal IDE.
        </p>
        <div className="philosophy-links">
          <a className="text-link" href="/docs/explanation/why-zd-is-minimal/">
            Read why zd is minimal <span aria-hidden="true">→</span>
          </a>
          <a className="text-link" href="https://discord.gg/3Qs2uejUf9">
            Join the Discord <span aria-hidden="true">→</span>
          </a>
          <a className="text-link" href="https://x.com/iamMrDuncan">
            Follow on X <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <section className="closing">
        <p className="eyebrow">Read. Edit. Review. Build.</p>
        <h2>Keep the document and the work together.</h2>
        <div className="hero-actions">
          <a className="button button-primary" href={RELEASE_URL}>
            Get zd
          </a>
          <a className="button" href="/docs/">
            Browse documentation
          </a>
          <a className="button" href="https://discord.gg/3Qs2uejUf9">
            Join Discord
          </a>
        </div>
      </section>
    </main>
  );
}

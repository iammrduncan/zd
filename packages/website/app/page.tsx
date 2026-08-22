import Link from "next/link";
import type { Metadata } from "next";

import workbenchScreenshot from "../../../docs/user-facing-docs/assets/zd-workbench.png";
import sideBySideScreenshot from "../../../docs/user-facing-docs/assets/zd-workbench-side-by-side.png";
import { pageMetadata, RELEASE_URL, SITE_DESCRIPTION, softwareApplicationJsonLd } from "@/lib/site";

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
        <p className="eyebrow">ZenSuite · local agent workbench</p>
        <h1>
          Keep every thread.
          <br />
          Keep the context.
        </h1>
        <p className="hero-copy">
          <code>zd</code> keeps projects, terminal-backed agent threads, files, and Git in one calm
          local workbench.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href={RELEASE_URL}>
            Download latest release
          </a>
          <Link className="button" href="/docs/">
            Read the docs
          </Link>
        </div>
        <p className="platform-note">Available for macOS and Windows · local by default</p>
      </section>

      <section className="product" aria-labelledby="product-heading">
        <div className="section-heading">
          <p className="eyebrow">One workbench</p>
          <h2 id="product-heading">Projects and agent sessions stay visible together.</h2>
        </div>
        <figure className="app-frame">
          <img
            src={workbenchScreenshot.src}
            width={1440}
            height={900}
            alt="The light zd workbench with projects and terminal threads on the left, an editable file in the centre, and Files on the right"
          />
          <figcaption>
            Project-scoped threads, the current file, and the compact file tree share one state.
          </figcaption>
        </figure>
      </section>

      <section className="features" aria-label="Product highlights">
        <article>
          <span className="feature-number">01</span>
          <h2>Several projects</h2>
          <p>
            Add only the folders you approve. Switch projects without tearing down inactive files or
            terminal sessions.
          </p>
        </article>
        <article>
          <span className="feature-number">02</span>
          <h2>Terminal-backed threads</h2>
          <p>
            Organize shells, Codex, Claude Code, and OpenCode sessions by project root or Git
            worktree.
          </p>
        </article>
        <article>
          <span className="feature-number">03</span>
          <h2>Files and Git</h2>
          <p>
            Edit Markdown and code, filter a dense file tree, and inspect status, history,
            comparisons, and read-only diffs.
          </p>
        </article>
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
          <Link className="text-link" href="/docs/how-to/manage-projects-and-threads/">
            Manage projects and threads <span aria-hidden="true">→</span>
          </Link>
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
          <Link className="text-link" href="/docs/explanation/architecture/">
            Understand the architecture <span aria-hidden="true">→</span>
          </Link>
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

      <section className="closing">
        <p className="eyebrow">Fast. Local. Quiet.</p>
        <h2>Keep the work in view.</h2>
        <div className="hero-actions">
          <a className="button button-primary" href={RELEASE_URL}>
            Get zd
          </a>
          <Link className="button" href="/docs/">
            Browse documentation
          </Link>
        </div>
      </section>
    </main>
  );
}

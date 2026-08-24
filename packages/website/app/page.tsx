import Link from "next/link";
import type { Metadata } from "next";

import workbenchScreenshot from "../../../docs/user-facing-docs/assets/zd-workbench.png";
import darkWorkbenchScreenshot from "../../../docs/user-facing-docs/assets/zd-workbench-dark.png";
import draculaWorkbenchScreenshot from "../../../docs/user-facing-docs/assets/zd-workbench-dracula.png";
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
          Run every agent.
          <br />
          Keep every thread.
        </h1>
        <p className="hero-copy">
          <code>zd</code> keeps Codex, Claude Code, OpenCode, shells, source files, and Git in one
          calm local workbench.
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
          <p className="eyebrow">One view, three themes</p>
          <h2 id="product-heading">See the agents and the code they are changing.</h2>
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

      <section className="features" aria-label="Product highlights">
        <article>
          <span className="feature-number">01</span>
          <h2>Move between projects</h2>
          <p>
            Keep several approved folders open and jump to the previous or next project without
            stopping inactive terminal sessions.
          </p>
        </article>
        <article>
          <span className="feature-number">02</span>
          <h2>Start a thread here</h2>
          <p>
            Create a terminal in the current project root with one shortcut, then run the agent or
            shell the work needs.
          </p>
        </article>
        <article>
          <span className="feature-number">03</span>
          <h2>Keep source beside output</h2>
          <p>
            Pair a terminal thread with the selected source while Files and read-only Git views stay
            available on the right.
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

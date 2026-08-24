import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";
import { rootMetadata } from "@/lib/site";

export const metadata: Metadata = rootMetadata;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script src="https://cdn.usefathom.com/script.js" data-site="LIDRLGUW" defer />
      </head>
      <body>
        <header className="site-header">
          <Link className="wordmark" href="/" aria-label="zd home">
            <span>zd</span>
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="/docs/">Docs</Link>
            <a href="https://github.com/iammrduncan/zd">GitHub</a>
            <a href="https://discord.gg/3Qs2uejUf9">Discord</a>
            <a className="nav-download" href="https://github.com/iammrduncan/zd/releases/latest">
              Download
            </a>
          </nav>
        </header>
        {children}
        <footer>
          <span>zd is open source under MIT.</span>
          <span className="footer-links">
            <a href="https://discord.gg/3Qs2uejUf9">Join Discord</a>
            <a href="https://github.com/iammrduncan/zd">View the source</a>
          </span>
        </footer>
      </body>
    </html>
  );
}

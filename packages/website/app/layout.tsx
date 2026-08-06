import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";
import { rootMetadata } from "@/lib/site";

export const metadata: Metadata = rootMetadata;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="wordmark" href="/" aria-label="zd md home">
            <span>zd</span> md
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="/docs/">Docs</Link>
            <a href="https://github.com/iammrduncan/zd">GitHub</a>
            <a className="nav-download" href="https://github.com/iammrduncan/zd/releases/latest">
              Download
            </a>
          </nav>
        </header>
        {children}
        <footer>
          <span>zd md is open source under MIT.</span>
          <a href="https://github.com/iammrduncan/zd">View the source</a>
        </footer>
      </body>
    </html>
  );
}

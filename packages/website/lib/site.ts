import type { Metadata } from "next";

import socialCard from "../../../docs/user-facing-docs/assets/zd-social-card.png";
import appIcon from "../../../packaging/icon.png";
import websitePackage from "../package.json";

export const SITE_URL = new URL("https://getzensuite.com");
export const SITE_NAME = "zd";
export const HOME_TITLE = "zd — A fast, local agent workbench";
export const SITE_DESCRIPTION =
  "Run terminal-backed coding agents beside their projects, source files, and Git in one fast, local workbench.";
export const REPOSITORY_URL = "https://github.com/iammrduncan/zd";
export const RELEASE_URL = `${REPOSITORY_URL}/releases/latest`;

type PageMetadata = {
  description: string;
  path: string;
  title?: string;
};

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export function pageMetadata({ description, path, title }: PageMetadata): Metadata {
  const socialTitle = title ? `${title} · ${SITE_NAME}` : HOME_TITLE;

  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: {
      description,
      images: [
        {
          alt: "zd — Keep projects, agent threads, files, and Git in one local workbench.",
          height: 630,
          url: socialCard.src,
          width: 1200,
        },
      ],
      siteName: SITE_NAME,
      title: socialTitle,
      type: "website",
      url: path,
    },
    twitter: {
      card: "summary_large_image",
      description,
      images: [socialCard.src],
      title: socialTitle,
    },
  };
}

export const rootMetadata: Metadata = {
  metadataBase: SITE_URL,
  applicationName: SITE_NAME,
  category: "technology",
  creator: "ZenSuite",
  description: SITE_DESCRIPTION,
  icons: {
    apple: [{ url: appIcon.src }],
    icon: [{ type: "image/png", url: appIcon.src }],
  },
  keywords: [
    "agent workbench",
    "terminal threads",
    "local developer tools",
    "Git workbench",
    "code editor",
  ],
  title: {
    default: HOME_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
};

export const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  applicationCategory: "DeveloperApplication",
  description: SITE_DESCRIPTION,
  downloadUrl: RELEASE_URL,
  license: "https://opensource.org/licenses/MIT",
  name: SITE_NAME,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  operatingSystem: "macOS, Windows",
  softwareVersion: websitePackage.version,
  url: SITE_URL.toString(),
};

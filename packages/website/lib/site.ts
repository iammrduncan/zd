import type { Metadata } from "next";

import socialCard from "../../../docs/user-facing-docs/assets/zd-social-card.png";
import appIcon from "../../../packaging/icon.png";
import websitePackage from "../package.json";

export const SITE_URL = new URL("https://getzensuite.com");
export const SITE_NAME = "zd md";
export const HOME_TITLE = "zd md — Read the long thing";
export const SITE_DESCRIPTION =
  "A calm, keyboard-first Markdown reader and editor for the long documents coding agents produce.";
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
          alt: "zd md — Read the long thing. Keep it editable.",
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
  creator: "Zen Suite",
  description: SITE_DESCRIPTION,
  icons: {
    apple: [{ url: appIcon.src }],
    icon: [{ type: "image/png", url: appIcon.src }],
  },
  keywords: ["Markdown editor", "Markdown reader", "developer tools", "writing app"],
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

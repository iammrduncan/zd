export const FATHOM_EVENTS = {
  discord: "Discord clicked",
  docs: "Documentation clicked",
  download: "Download clicked",
  github: "GitHub clicked",
  x: "X clicked",
} as const;

interface FathomAnalytics {
  trackEvent(name: string): void;
}

function eventForLink(link: HTMLAnchorElement, siteOrigin: string): string | null {
  const destination = new URL(link.href, siteOrigin);
  if (
    destination.hostname === "github.com" &&
    destination.pathname.endsWith("/releases/latest")
  ) {
    return FATHOM_EVENTS.download;
  }
  if (destination.hostname === "github.com") return FATHOM_EVENTS.github;
  if (destination.hostname === "x.com") return FATHOM_EVENTS.x;
  if (destination.hostname === "discord.gg") return FATHOM_EVENTS.discord;
  if (destination.origin === siteOrigin && destination.pathname.startsWith("/docs")) {
    return FATHOM_EVENTS.docs;
  }
  return null;
}

/**
 * Track the destination category without interrupting the link's native navigation.
 *
 * Returning the classification makes the click behavior testable even when the
 * deferred Fathom script has not loaded yet.
 */
export function trackFathomClick(
  target: EventTarget | null,
  siteOrigin: string,
  analytics?: FathomAnalytics,
): string | null {
  if (!(target instanceof Element)) return null;
  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (!link) return null;
  const event = eventForLink(link, siteOrigin);
  if (!event) return null;
  analytics?.trackEvent(event);
  return event;
}

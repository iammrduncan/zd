"use client";

import { useEffect } from "react";

import { trackFathomClick } from "@/lib/fathom";

declare global {
  interface Window {
    fathom?: {
      trackEvent(name: string): void;
    };
  }
}

/** Capture the site's high-value link destinations from server-rendered pages. */
export function FathomEvents() {
  useEffect(() => {
    const trackClick = (event: MouseEvent) => {
      trackFathomClick(event.target, window.location.origin, window.fathom);
    };
    document.addEventListener("click", trackClick);
    return () => document.removeEventListener("click", trackClick);
  }, []);

  return null;
}

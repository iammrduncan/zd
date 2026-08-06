"use client";

import { useEffect, useState } from "react";

import styles from "./presence.module.css";

type Presence = number | "loading" | "unavailable";

function liveCount(value: unknown): number | null {
  if (typeof value !== "object" || value === null || !("live" in value)) return null;
  const live = (value as { live: unknown }).live;
  return typeof live === "number" && Number.isSafeInteger(live) && live >= 0 ? live : null;
}

function presenceLabel(presence: Presence): string {
  if (presence === "loading") return "Checking live app activity…";
  if (presence === "unavailable") return "Live app activity unavailable";
  return presence === 1 ? "1 person is using zd now" : `${presence} people are using zd now`;
}

export function AppPresence() {
  const [presence, setPresence] = useState<Presence>("loading");

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const response = await fetch("/api/zd-presence", { cache: "no-store" });
        if (!response.ok) throw new Error(`presence request failed: ${response.status}`);
        const live = liveCount(await response.json());
        if (live === null) throw new Error("presence response did not contain a live count");
        if (active) setPresence(live);
      } catch {
        if (active) {
          setPresence((current) => (typeof current === "number" ? current : "unavailable"));
        }
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const online = typeof presence === "number" && presence > 0;
  return (
    <p className={styles.presence} aria-live="polite">
      <span className={`${styles.dot} ${online ? styles.online : ""}`} aria-hidden="true" />
      {presenceLabel(presence)}
    </p>
  );
}

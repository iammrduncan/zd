import type { Platform } from "@/platform";
import { onSspsEnabledChange, setSspsEnabled, sspsEnabled } from "./preferences";
import { register } from "./shortcuts";

const SITE_ID = "271";
const VISITOR_KEY = "ssps:visitor-id";
const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

let stopActivePresence: (() => void) | null = null;

function visitorId(): string {
  try {
    const remembered = window.localStorage.getItem(VISITOR_KEY);
    if (remembered) return remembered;

    const created =
      window.crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function presenceUrl(): string {
  return `wss://usessps.com/ws?site-id=${SITE_ID}&visitor-id=${encodeURIComponent(visitorId())}`;
}

/** Keep one controllable SSPS connection for the lifetime of a native window. */
export function trackAppPresence(kind: Platform["kind"]): () => void {
  if (kind !== "tauri") return () => {};
  if (stopActivePresence) return stopActivePresence;

  let enabled = sspsEnabled();
  let disposed = false;
  let reconnectDelay = INITIAL_RECONNECT_MS;
  let reconnectTimer: number | null = null;
  let socket: WebSocket | null = null;

  const clearReconnect = () => {
    if (reconnectTimer === null) return;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const disconnect = () => {
    clearReconnect();
    const current = socket;
    socket = null;
    if (!current) return;

    current.onclose = null;
    current.onerror = null;
    current.onopen = null;
    try {
      current.close();
    } catch {
      // The connection is already unusable, which is the disabled state we need.
    }
  };

  const connect = () => {
    clearReconnect();
    if (disposed || !enabled || socket) return;

    let current: WebSocket;
    try {
      current = new WebSocket(presenceUrl());
    } catch {
      // Presence reporting must never prevent the editor from opening.
      return;
    }
    socket = current;
    current.onopen = () => {
      if (socket === current) reconnectDelay = INITIAL_RECONNECT_MS;
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      if (socket !== current) return;
      socket = null;
      if (disposed || !enabled) return;

      const delay = reconnectDelay + Math.floor(Math.random() * INITIAL_RECONNECT_MS);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
      reconnectTimer = window.setTimeout(connect, delay);
    };
  };

  const stopFollowingPreference = onSspsEnabledChange((on) => {
    enabled = on;
    if (enabled) connect();
    else disconnect();
  });
  connect();

  const stop = () => {
    if (disposed) return;
    disposed = true;
    stopFollowingPreference();
    disconnect();
    if (stopActivePresence === stop) stopActivePresence = null;
  };
  stopActivePresence = stop;
  return stop;
}

/** Put the global SSPS preference in the suite's one shortcut registry. */
export function registerPresenceToggle(): () => void {
  return register({
    id: "suite.ssps",
    chord: { key: "p", mod: true, alt: true },
    description: "Toggle anonymous SSPS presence reporting globally",
    run: () => {
      setSspsEnabled(!sspsEnabled());
      return true;
    },
  });
}

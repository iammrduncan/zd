/* global URL, Response, console, fetch */

const PRESENCE_PATH = "/api/zd-presence";
const SSPS_STATS_URL = "https://usessps.com/api/sites/271/stats";

function json(value, status, cacheControl) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function fetchPresence(fetcher = fetch) {
  const response = await fetcher(SSPS_STATS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`SSPS returned ${response.status}`);

  const stats = await response.json();
  if (!Number.isSafeInteger(stats.live) || stats.live < 0) {
    throw new Error("SSPS returned an invalid live count");
  }
  return json({ live: stats.live }, 200, "public, max-age=5");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PRESENCE_PATH) return env.ASSETS.fetch(request);
    if (request.method !== "GET") {
      const response = json({ error: "method not allowed" }, 405, "no-store");
      response.headers.set("Allow", "GET");
      return response;
    }

    try {
      return await fetchPresence();
    } catch (error) {
      const requestId = request.headers.get("cf-ray") ?? "local";
      console.error("presence proxy failed", { error, requestId });
      return json({ error: "presence unavailable" }, 503, "no-store");
    }
  },
};

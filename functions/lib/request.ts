/**
 * The bits every endpoint here repeats: how to answer in JSON, how to read a
 * number out of a query string, and what counts as a place to look at.
 *
 * ⚠️ Extracted because the two endpoints had transcribed each other. The radius
 * bounds in particular were two literals under a comment saying they must
 * match — which is a hope, not a mechanism: the day one of them moves, the app
 * clamps a search and its own map to different circles and nothing complains.
 */

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // No CORS headers anywhere on purpose: in production the Functions are
      // served from the app's own origin, and in dev Vite proxies /api, so the
      // browser never makes a cross-origin request. Opening them up would only
      // invite other sites to spend our Overpass budget.
      "Cache-Control": "no-store"
    }
  });

const number = (value: string | null): number | null => {
  if (value === null || value.trim() === "") return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

/** Anything below this is a point, not an area; anything above, a continent. */
export const MIN_RADIUS = 100;
export const MAX_RADIUS = 20000;

/**
 * `?lat&lon&radius` → the circle to look at, or null when the request doesn't
 * describe one. The radius comes back clamped, so callers never have to decide
 * again what an absurd one means.
 */
export const readArea = (
  url: URL
): { lat: number; lon: number; around: number } | null => {
  const lat = number(url.searchParams.get("lat"));
  const lon = number(url.searchParams.get("lon"));
  const radius = number(url.searchParams.get("radius"));

  if (
    lat === null ||
    lon === null ||
    radius === null ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  return {
    lat,
    lon,
    around: Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius))
  };
};

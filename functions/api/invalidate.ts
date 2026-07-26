import { invalidateTile } from "../lib/store";
import { tileForPoint } from "../lib/tiles";

/**
 * `POST /api/invalidate  { lat, lon }`
 *
 * The tile TTL is 30 days, which is right for OSM in general and completely
 * wrong for the one node the user just added from this app: without this they
 * would pan away, come back, and find their own fountain missing.
 *
 * Deliberately *only* marks a tile stale — it never accepts data. An
 * unauthenticated write endpoint would let anyone put anything in the cache;
 * the worst this one can do is make the server ask Overpass again, and the
 * pending claim already bounds that.
 */

type Env = { DB: D1Database };

export const onRequestPost: PagesFunction<Env> = async context => {
  let body: { lat?: unknown; lon?: unknown };

  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const lat = Number(body.lat);
  const lon = Number(body.lon);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return new Response(JSON.stringify({ error: "lat and lon are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const tile = tileForPoint(lat, lon);

  await invalidateTile(context.env.DB, tile.key);

  console.log(`[invalidate] tile ${tile.key} (lat=${lat} lon=${lon})`);

  return new Response(JSON.stringify({ tile: tile.key }), {
    headers: { "Content-Type": "application/json" }
  });
};

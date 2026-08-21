import {
  MAX_SEARCH_RESULTS,
  SearchResultNode,
  findSearchPreset,
  normalizeSearchElement,
  searchQuery
} from "../../shared/searchPresets";
import { overpassFetch } from "../lib/overpass";
import { json, readArea } from "../lib/request";

/**
 * `GET /api/search?preset=<id>&lat&lon&radius`
 *
 * The one-off lookup: everything the map does **not** carry (see
 * `shared/searchPresets.ts`). Same rule as `/api/amenities` — the browser never
 * talks to Overpass — but the opposite caching story, on purpose: there is no
 * tile, no D1 row and no offline copy behind this, so the answer is always
 * live and the user waits for it.
 *
 * ⚠️ The client sends a preset **id**. The tags are looked up in this server's
 * own table and the query is built from string literals in that file, so no
 * client input reaches Overpass. An endpoint that took `key=value` from the
 * request would be an open query proxy onto a shared public instance, and a
 * 429 earned there hurts every user of this app, not the one who caused it.
 */

/**
 * ⚠️ Longer than the amenity path's 6s response budget, and for the opposite
 * reason: there, answering early is free because D1 already holds something and
 * the fetch continues behind the reply. Here an early answer is simply "no
 * results", which is a lie. Measured on the four instances 2026-07-26, a slow
 * one queues for tens of seconds while another answers in 5 — that is exactly
 * what the hedge in `overpassFetch` is for, and it needs room to fire (8s) and
 * for the second instance to reply.
 */
const SEARCH_DEADLINE_MS = 20000;

/**
 * How long an identical search is served from Cloudflare's edge cache.
 *
 * ⚠️ Not a performance nicety — it is the only brake on this endpoint. Unlike
 * the tile path there is no D1 cache making repeat calls free, so a retry loop
 * (or a bored finger on "Search again") goes straight to a public Overpass
 * instance every time. Ten minutes is nothing against how fast OSM changes and
 * bounds the damage; the key is rounded below so two searches from the same
 * street corner share one answer.
 */
const CACHE_TTL_S = 600;

/**
 * Coordinate precision of the cache key: 3 decimals ≈ 110m at the equator, and
 * less north of it. Small against the smallest radius the app can search (500m
 * from the slider), so a shared answer is still an answer about where you are.
 */
const CACHE_COORD_DECIMALS = 3;

const response = (body: string, cacheControl = "no-store") =>
  new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl
    }
  });

// ⚠️ No `Env`: this endpoint touches no binding at all. There is no D1 behind a
// search — that is the design, not an omission (see shared/searchPresets.ts).
export const onRequestGet: PagesFunction = async context => {
  const url = new URL(context.request.url);
  const presetId = url.searchParams.get("preset") || "";
  const area = readArea(url);

  if (!area) {
    return json({ error: "lat, lon and radius are required" }, 400);
  }

  const preset = findSearchPreset(presetId);

  if (!preset) {
    return json({ error: `unknown preset "${presetId}"` }, 400);
  }

  const { lat, lon, around } = area;
  const startedAt = Date.now();

  // ⚠️ Cache under a *rounded* centre, but answer about the real one: the
  // coordinates below only build the key, the distances further down use what
  // the client actually asked for.
  const cache = (caches as unknown as { default?: Cache }).default;
  const cacheKey = new Request(
    `${url.origin}/api/search?preset=${preset.id}&radius=${around}&lat=${lat.toFixed(
      CACHE_COORD_DECIMALS
    )}&lon=${lon.toFixed(CACHE_COORD_DECIMALS)}`,
    { method: "GET" }
  );

  const cached = await cache?.match(cacheKey).catch(() => undefined);

  if (cached) {
    console.log(
      `[search] preset=${preset.id} r=${around} CACHE HIT ms=${Date.now() - startedAt}`
    );

    // ⚠️ The stored bytes are streamed straight through: parsing and
    // re-serializing them would spend Worker CPU proportional to the answer
    // (hundreds of KB at the cap) on the one path that exists to be cheap.
    // Only the header changes — the edge copy carries a max-age so the cache
    // keeps it, the browser gets no-store so a retry reaches this Function.
    return new Response(cached.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  }

  let elements;

  try {
    const result = await overpassFetch(
      searchQuery(preset, { lat, lon, radius: around }),
      { deadline: startedAt + SEARCH_DEADLINE_MS }
    );

    elements = result.elements;

    console.log(
      `[search] preset=${preset.id} r=${around} ${elements.length} elements in ${result.ms}ms via ${result.endpoint} (attempt ${result.attempts})`
    );
  } catch (e) {
    const message = (e as Error).message || String(e);
    console.log(`[search] preset=${preset.id} r=${around} FAILED: ${message}`);

    // ⚠️ A failure here is a failure, full stop. The amenity endpoint can
    // answer 200 with a stale cache behind it; this one has nothing to fall
    // back on, and pretending otherwise would show an empty map over an area
    // nobody looked at.
    return json({ error: "OpenStreetMap isn't responding" }, 503);
  }

  // ⚠️ We asked for one more than the cap precisely so this test can exist.
  // Over the cap we return *nothing*: Overpass hands back objects in its own
  // order, so "the first 2000" is a spatially arbitrary scatter that would omit
  // the one on this corner while drawing pins 10km away — a map claiming a
  // coverage it doesn't have. Narrowing the radius is the honest way out, and
  // the user already has that slider.
  const tooMany = elements.length > MAX_SEARCH_RESULTS;

  // ⚠️ Unordered on purpose. These go into a clustered GeoJSON source, which
  // has no notion of order, and nothing else reads `nodes[0]` — a nearest-first
  // sort over 2,000 results was work with no reader. Bring it back the day
  // something asks "how far is the closest one".
  const nodes: SearchResultNode[] = tooMany
    ? []
    : elements
        .map(normalizeSearchElement)
        .filter((node): node is SearchResultNode => node !== null);

  // ⚠️ One exit, so the "too many" answer is cached like any other. It used to
  // return early, which meant the single most expensive query in the catalogue
  // — the dense preset over a wide radius, the one that makes Overpass work
  // hardest — was the only one that never got the brake this cache exists to
  // be, and every press of "Search again" went straight back out.
  // serialized once and handed to both the reply and the cache: at the cap this
  // is ~1 MB of string work, and it is the request that already paid for
  // Overpass
  const body = JSON.stringify({ preset: preset.id, nodes, tooMany });

  if (cache) {
    context.waitUntil(
      cache
        .put(cacheKey, response(body, `public, max-age=${CACHE_TTL_S}`))
        .catch(() => undefined)
    );
  }

  return response(body);
};

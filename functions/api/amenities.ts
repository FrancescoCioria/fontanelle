import {
  OpenStreetMapNode,
  RADIUS_MARGIN,
  normalizeElement,
  overpassQuery
} from "../../shared/amenities";
import { overpassFetch, pool } from "../lib/overpass";
import { json, readArea } from "../lib/request";
import {
  claimTile,
  failTile,
  readNodesInBBox,
  readTileStates,
  writeTile
} from "../lib/store";
import {
  Tile,
  distanceMeters,
  radiusBBox,
  tileBBox,
  tilesForRadius
} from "../lib/tiles";

/**
 * `GET /api/amenities?lat&lon&radius`
 *
 * The only door to OpenStreetMap. The browser never talks to Overpass: it asks
 * here, gets whatever the cache already knows straight away, and the server
 * decides — behind that answer — which tiles are worth refetching, in what
 * order, with which retries. What the client keeps is a copy for offline, not
 * the source of truth.
 */

type Env = { DB: D1Database };

/** OSM amenities move at the speed of civil engineering. */
const TILE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long a claim keeps others off a tile — deliberately far shorter than the
 * work it covers, because it is **renewed while that work is alive** (see the
 * heartbeat below). It is therefore a liveness lease, not a duration estimate.
 *
 * ⚠️ The number that matters here is how long a *dead* claim blackens the map.
 * A claim outlives its worker whenever the connection drops inside the response
 * budget — a phone losing signal, an app sent to the background — and Cloudflare
 * then kills the invocation with no chance to record anything. That state is
 * invisible: no error, so nothing counts as `unreachable`; the tile just answers
 * "someone is fetching me" while nobody is. Measured 2026-08-10 on the live D1:
 * of 21 tiles, 5 sat at `fetched_at = 0` with `error IS NULL` — abandoned, not
 * failed — and one of those predated any testing, straight from real use.
 */
const CLAIM_MS = 25 * 1000;

/**
 * How often a live fetch re-stamps its claim. ⚠️ Must stay comfortably under
 * CLAIM_MS or a slow-but-healthy fetch loses its own tile to a second request.
 * A dead worker stops beating — that is the whole mechanism.
 */
const CLAIM_HEARTBEAT_MS = 10 * 1000;

/** Breather after a failed tile, so a bad Overpass day isn't a hammering loop. */
const FAILURE_COOLDOWN_MS = 30 * 1000;

/**
 * ⚠️ How long we make the *client* wait, not how long the work takes. Overpass
 * answering a dense tile in 60s is normal on a bad day (measured 2026-07-26,
 * Paris); blocking a map on that is not. Past this budget we reply with what is
 * already in D1, flagged `partial`, and let the fetch finish in `waitUntil` —
 * the client comes back a few seconds later and the tiles are there.
 */
const RESPONSE_BUDGET_MS = 6000;

/** Hard stop for the background half. Two 30s attempts, then give up. */
const WORK_DEADLINE_MS = 60000;

/**
 * Tiles fetched at once. ⚠️ Kept low because each tile is *hedged* across up to
 * 3 instances (see overpass.ts): 2 × 3 is exactly the 6 simultaneous outbound
 * connections a Worker gets. Raise this and the extra fetches silently queue,
 * which turns the hedge — whose whole point is not waiting — back into a queue.
 */
const FETCH_CONCURRENCY = 2;

/**
 * Upper bound on tiles *refreshed* in one request, deadline aside. ⚠️ Low on
 * purpose: pushing 30 tiles through in one go earned a 429 from
 * overpass-api.de during testing, and a rate limit hurts every user of the app,
 * not just the one who asked for a 15km radius. The rest fills in over the
 * client's follow-up calls.
 *
 * ⚠️ This caps *fetching*, never *reading*: everything already in D1 for the
 * requested area comes back regardless, or a wide radius would keep hiding
 * cached tiles behind its own refresh budget.
 */
const MAX_REFRESH_PER_REQUEST = 12;

/** Sanity bound on the area one request may cover at all. */
const MAX_TILES_PER_REQUEST = 100;

/** Guards the response size when someone asks for 15km of central Paris. */
const MAX_NODES = 12000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const onRequestGet: PagesFunction<Env> = async context => {
  const url = new URL(context.request.url);
  const area = readArea(url);

  if (!area) {
    return json({ error: "lat, lon and radius are required" }, 400);
  }

  const { lat, lon, around } = area;
  // The circle the user asked for, plus a hair so nothing sits exactly on the
  // edge. ⚠️ A `bbox` parameter used to widen this to the whole viewport; it is
  // ignored now, deliberately, because clients cached by the service worker
  // still send it — see RADIUS_MARGIN for what that cost.
  const shown = around * RADIUS_MARGIN;
  const db = context.env.DB;
  const startedAt = Date.now();

  const allTiles = tilesForRadius(lat, lon, around);
  const tiles = allTiles.slice(0, MAX_TILES_PER_REQUEST);

  if (allTiles.length > tiles.length) {
    // no silent caps: the far edge of a huge radius fills in on later requests
    console.log(
      `[amenities] capped tiles ${allTiles.length} -> ${tiles.length} (lat=${lat} lon=${lon} r=${around})`
    );
  }

  const states = await readTileStates(
    db,
    tiles.map(t => t.key)
  );

  // Buckets, and the differences all reach the user interface:
  //  - `held`    someone else is fetching it right now → "still loading"
  //  - `cooling` it just failed and is backing off     → "OSM is unreachable"
  // ⚠️ Collapsing those two is what left the app saying "loading…" forever
  // while Overpass was down, which reads exactly like an empty area.
  const allStale: Tile[] = [];
  let held = 0;
  let cooling = 0;

  tiles.forEach(tile => {
    const state = states.get(tile.key);

    if (state && state.retryAfter > startedAt) {
      if (state.error) cooling++;
      else held++;
      return;
    }

    if (!state || startedAt - state.fetchedAt > TILE_TTL_MS) {
      allStale.push(tile);
    }
  });

  // nearest first (tilesForRadius already sorts), so a clipped budget goes to
  // what is under the user's nose
  const stale = allStale.slice(0, MAX_REFRESH_PER_REQUEST);
  const deferred = allStale.length - stale.length;

  if (deferred > 0) {
    console.log(
      `[amenities] deferring ${deferred} stale tiles beyond the refresh budget`
    );
  }

  let fetched = 0;
  let failed = 0;
  let skipped = 0;

  const work = pool(stale, FETCH_CONCURRENCY, async tile => {
    if (Date.now() - startedAt > WORK_DEADLINE_MS) {
      skipped++;
      return;
    }

    // ⚠️ Renews the claim for as long as this invocation is alive. Timers only
    // fire inside a running invocation, which is exactly the property wanted:
    // the moment Cloudflare kills us — the client's connection dropped mid
    // request — the beating stops and the lease runs out on its own, instead of
    // holding the tile dark for the length of the longest fetch imaginable.
    const heartbeat = setInterval(() => {
      claimTile(db, tile.key, Date.now() + CLAIM_MS).catch(() => undefined);
    }, CLAIM_HEARTBEAT_MS);

    try {
      await claimTile(db, tile.key, Date.now() + CLAIM_MS);

      const result = await overpassFetch(overpassQuery(tileBBox(tile)), {
        deadline: startedAt + WORK_DEADLINE_MS
      });

      const nodes = result.elements
        .map(normalizeElement)
        .filter((n): n is OpenStreetMapNode => n !== null);

      // ⚠️ Before writeTile, not after: writeTile clears retry_after, and a beat
      // landing behind it would re-lock a tile that is already done.
      clearInterval(heartbeat);

      await writeTile(db, tile, nodes, Date.now(), result.dataTimestamp);
      fetched++;

      console.log(
        `[amenities] tile ${tile.key} ok: ${nodes.length}/${result.elements.length} nodes in ${result.ms}ms via ${result.endpoint} (attempt ${result.attempts}, data lag ${result.dataTimestamp ? Math.round((Date.now() - result.dataTimestamp) / 1000) + 's' : 'unknown'})`
      );
    } catch (e) {
      clearInterval(heartbeat);

      failed++;
      const message = (e as Error).message || String(e);
      console.log(`[amenities] tile ${tile.key} FAILED: ${message}`);
      await failTile(
        db,
        tile.key,
        Date.now() + FAILURE_COOLDOWN_MS,
        message
      ).catch(() => undefined);
    }
  });

  // Give the fetches a short head start — an empty area usually resolves well
  // inside it — then answer regardless.
  await Promise.race([work, delay(RESPONSE_BUDGET_MS)]);

  // ⚠️ Not `await`: the point is that the tiles still in flight keep going and
  // land in D1 after this response, ready for the client's next call.
  //
  // ⚠️ It protects them only once the response is out, and moving this line
  // above the race does not change that — measured against production
  // 2026-08-10, three cases:
  //  - client disconnects *after* the reply → work survives, tiles land (~25s);
  //  - browser `AbortController` on a live HTTP/2 connection → also survives:
  //    it resets one stream, not the connection, so the Function is untouched;
  //  - the connection itself dropping inside the budget above (phone losing
  //    signal, app backgrounded) → the invocation is killed outright, and the
  //    tiles it had already claimed stay claimed for CLAIM_MS with nobody
  //    flying them. Every request over that area then answers `held` — "still
  //    loading" — for a minute and a half, over a slice of map with no pins.
  // A dead claim is indistinguishable from a live one here; the only bound on
  // it is CLAIM_MS.
  context.waitUntil(work);

  const rows = await readNodesInBBox(db, radiusBBox(lat, lon, shown));

  // The box is the square around the circle, so the corners still have to go.
  // Ordered by distance, so if MAX_NODES bites it is the far edge that goes.
  const withDistance = rows
    .map(node => ({
      node,
      d: distanceMeters({ lat, lon }, { lat: node.lat, lon: node.lon })
    }))
    .filter(n => n.d <= shown)
    .sort((a, b) => a.d - b.d);

  if (withDistance.length > MAX_NODES) {
    console.log(
      `[amenities] capped nodes ${withDistance.length} -> ${MAX_NODES}`
    );
  }

  const nodes = withDistance.slice(0, MAX_NODES).map(n => n.node);

  // `partial` means "ask again in a moment", never "error": the answer already
  // carries every tile that did land.
  const inFlight = stale.length - fetched - failed;
  // `unreachable` is the honest count of tiles we currently cannot get: ones we
  // just failed on, plus ones still cooling down from an earlier failure.
  const unreachable = failed + cooling;
  const partial =
    inFlight > 0 || unreachable > 0 || held > 0 || deferred > 0;

  console.log(
    `[amenities] lat=${lat.toFixed(4)} lon=${lon.toFixed(4)} r=${around} tiles=${tiles.length} stale=${allStale.length} held=${held} cooling=${cooling} fetched=${fetched} failed=${failed} deferred=${deferred} skipped=${skipped} nodes=${nodes.length} partial=${partial} ms=${Date.now() - startedAt}`
  );

  return json({
    nodes,
    partial,
    tiles: {
      requested: tiles.length,
      dropped: allTiles.length - tiles.length,
      stale: allStale.length,
      held,
      fetched,
      failed,
      cooling,
      unreachable,
      deferred,
      inFlight
    }
  });
};

import { OpenStreetMapNode, nodeKey } from "../../shared/amenities";
import { BBox, Tile, tileForPoint } from "./tiles";

/**
 * D1 access. Two tables, one invariant: **`tiles` is freshness, `nodes` is
 * data**. A node belongs to exactly one tile — the one containing its point —
 * so refreshing a tile can delete whatever that tile no longer returns, which
 * is how an amenity deleted in OSM eventually disappears here too.
 */

export type TileState = {
  key: string;
  fetchedAt: number;
  retryAfter: number;
};

/** D1 documents a 100-bound-parameter ceiling per statement. */
const PARAM_CHUNK = 50;
/** Statements per `batch()`; keeps a single transaction from getting huge. */
const BATCH_CHUNK = 40;

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }

  return out;
};

export const readTileStates = async (
  db: D1Database,
  keys: string[]
): Promise<Map<string, TileState>> => {
  const states = new Map<string, TileState>();

  for (const group of chunk(keys, PARAM_CHUNK)) {
    const placeholders = group.map(() => "?").join(",");

    const { results } = await db
      .prepare(
        `SELECT key, fetched_at, retry_after FROM tiles WHERE key IN (${placeholders})`
      )
      .bind(...group)
      .all<{ key: string; fetched_at: number; retry_after: number }>();

    (results || []).forEach(row =>
      states.set(row.key, {
        key: row.key,
        fetchedAt: row.fetched_at,
        retryAfter: row.retry_after
      })
    );
  }

  return states;
};

/**
 * `retry_after` answers one question — "may anyone fetch this tile right now?"
 * — and covers both cases where the answer is no:
 *  - a request is fetching it (claim), so a second one shouldn't ask Overpass
 *    the same question in parallel;
 *  - it just failed (cooldown), so the client's own retry a few seconds later
 *    doesn't turn a bad Overpass day into a hammering loop.
 *
 * ⚠️ Written by the worker that is about to fetch, not up-front for the whole
 * batch: a request that runs out of deadline would otherwise leave tiles marked
 * as in-flight with nobody flying them.
 */
export const claimTile = (
  db: D1Database,
  key: string,
  retryAfter: number
): Promise<unknown> =>
  db
    .prepare(
      `INSERT INTO tiles (key, fetched_at, retry_after) VALUES (?, 0, ?)
       ON CONFLICT(key) DO UPDATE SET retry_after = excluded.retry_after`
    )
    .bind(key, retryAfter)
    .run();

/** Record a failed fetch and hold the tile until the cooldown expires. */
export const failTile = (
  db: D1Database,
  key: string,
  retryAfter: number,
  error: string
): Promise<unknown> =>
  db
    .prepare(
      `INSERT INTO tiles (key, fetched_at, retry_after, error) VALUES (?, 0, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         retry_after = excluded.retry_after,
         error = excluded.error`
    )
    .bind(key, retryAfter, error.slice(0, 500))
    .run();

/**
 * How far back we assume an Overpass answer is lagging when it doesn't tell us
 * (`osm3s.timestamp_osm_base` missing). Measured lag on 2026-07-26 was 1.3–1.9
 * minutes; 15 is a wide, cheap margin — the only cost of being too generous is
 * that a row deleted upstream survives one extra refresh cycle.
 */
const ASSUMED_REPLICATION_LAG_MS = 15 * 60 * 1000;

/**
 * Replace a tile's contents. Nodes are stamped with `now`; anything still
 * carrying an older stamp for this tile was not in the answer, so it is gone
 * from OSM (or moved to a neighbouring tile, which re-homed the row already).
 *
 * ⚠️ "Older" is measured against `dataTimestamp` — the instant the Overpass
 * answer describes — and **never against the clock**. Overpass replicates with
 * a lag, so its answer legitimately does not contain a node created a minute
 * ago; deleting against `now` therefore erases exactly the freshest rows we
 * have, the ones a user just wrote through /api/osm. Reproduced 2026-07-26: a
 * node created in the app vanished on the very next refresh of its tile — and
 * since that refresh marks the tile fresh, it stayed gone for the 30-day TTL.
 */
export const writeTile = async (
  db: D1Database,
  tile: Tile,
  nodes: OpenStreetMapNode[],
  now: number,
  dataTimestamp: number | null
): Promise<void> => {
  const knownAt = Math.min(
    dataTimestamp ?? now - ASSUMED_REPLICATION_LAG_MS,
    now
  );

  const upsert = db.prepare(
    `INSERT INTO nodes (key, tile, lat, lon, amenity, tags, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       tile = excluded.tile,
       lat = excluded.lat,
       lon = excluded.lon,
       amenity = excluded.amenity,
       tags = excluded.tags,
       updated_at = excluded.updated_at`
  );

  const statements = nodes.map(node =>
    upsert.bind(
      nodeKey(node),
      // by the node's own point, not the queried tile: Overpass returns ways
      // that merely *touch* the bbox, and their centre may sit next door
      tileForPoint(node.lat, node.lon).key,
      node.lat,
      node.lon,
      node.tags.amenity,
      JSON.stringify(node.tags),
      now
    )
  );

  for (const group of chunk(statements, BATCH_CHUNK)) {
    await db.batch(group);
  }

  await db.batch([
    db
      .prepare(`DELETE FROM nodes WHERE tile = ? AND updated_at < ?`)
      .bind(tile.key, knownAt),
    db
      .prepare(
        `INSERT INTO tiles (key, fetched_at, retry_after, node_count, error)
         VALUES (?, ?, 0, ?, NULL)
         ON CONFLICT(key) DO UPDATE SET
           fetched_at = excluded.fetched_at,
           retry_after = 0,
           node_count = excluded.node_count,
           error = NULL`
      )
      .bind(tile.key, now, nodes.length)
  ]);
};

type NodeRow = { key: string; lat: number; lon: number; tags: string };

const rowToNode = (row: NodeRow): OpenStreetMapNode | null => {
  const [elementType, id] = row.key.split("/");

  try {
    return {
      id: parseInt(id, 10),
      lat: row.lat,
      lon: row.lon,
      elementType: elementType as OpenStreetMapNode["elementType"],
      tags: JSON.parse(row.tags)
    };
  } catch {
    return null;
  }
};

/**
 * Read by bounding box, not by tile: a node fetched for one tile may live in
 * the next one over, and the reader should not care which query brought it in.
 */
export const readNodesInBBox = async (
  db: D1Database,
  bbox: BBox
): Promise<OpenStreetMapNode[]> => {
  const { results } = await db
    .prepare(
      `SELECT key, lat, lon, tags FROM nodes
       WHERE lat >= ? AND lat <= ? AND lon >= ? AND lon <= ?`
    )
    .bind(bbox.south, bbox.north, bbox.west, bbox.east)
    .all<NodeRow>();

  return (results || [])
    .map(rowToNode)
    .filter((n): n is OpenStreetMapNode => n !== null);
};

/**
 * Write one node straight into the cache, used after an OSM edit made through
 * `/api/osm`. ⚠️ The `now` stamp is what protects it: a tile refresh deletes
 * only rows older than the Overpass answer's own data timestamp, which is
 * minutes behind — see `writeTile`.
 */
export const upsertNode = (
  db: D1Database,
  node: OpenStreetMapNode,
  now: number
): Promise<unknown> =>
  db
    .prepare(
      `INSERT INTO nodes (key, tile, lat, lon, amenity, tags, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         tile = excluded.tile,
         lat = excluded.lat,
         lon = excluded.lon,
         amenity = excluded.amenity,
         tags = excluded.tags,
         updated_at = excluded.updated_at`
    )
    .bind(
      nodeKey(node),
      tileForPoint(node.lat, node.lon).key,
      node.lat,
      node.lon,
      node.tags.amenity,
      JSON.stringify(node.tags),
      now
    )
    .run();

export const deleteNode = (db: D1Database, key: string): Promise<unknown> =>
  db.prepare(`DELETE FROM nodes WHERE key = ?`).bind(key).run();

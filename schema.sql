-- D1 schema for the server-side OSM cache.
-- Apply with:
--   npx wrangler d1 execute fontanelle-db --remote --file schema.sql
--   npx wrangler d1 execute fontanelle-db --local  --file schema.sql

-- Freshness bookkeeping, one row per slippy tile (see functions/lib/tiles.ts).
CREATE TABLE IF NOT EXISTS tiles (
  key         TEXT PRIMARY KEY,           -- "12/2145/1470"
  fetched_at  INTEGER NOT NULL DEFAULT 0, -- epoch ms of the last good answer
  retry_after INTEGER NOT NULL DEFAULT 0, -- in flight, or cooling down after a failure
  node_count  INTEGER NOT NULL DEFAULT 0,
  error       TEXT                        -- last failure, NULL when healthy
);

-- The data. `tile` is the tile *containing the point*, which is what makes
-- "delete what this tile no longer returns" safe.
CREATE TABLE IF NOT EXISTS nodes (
  key        TEXT PRIMARY KEY,  -- "node/123" / "way/123": different objects
  tile       TEXT NOT NULL,
  lat        REAL NOT NULL,
  lon        REAL NOT NULL,
  amenity    TEXT NOT NULL,
  tags       TEXT NOT NULL,     -- JSON, exactly what the client renders
  updated_at INTEGER NOT NULL
);

-- Reads are by bounding box, never by tile — a node fetched for one tile may
-- live in the next one over.
CREATE INDEX IF NOT EXISTS nodes_lat_lon ON nodes (lat, lon);
CREATE INDEX IF NOT EXISTS nodes_tile ON nodes (tile);

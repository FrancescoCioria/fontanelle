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

-- Append-only write log. ⚠️ NEVER read to decide anything — enforcement and
-- state live in the tables above; this is history, for a human, after the fact.
-- Exists because console.log on Pages Functions is only visible to a `tail`
-- running at that very moment: real edits left no trace to inspect later.
CREATE TABLE IF NOT EXISTS audit_events (
  id           TEXT PRIMARY KEY,
  occurred_at  INTEGER NOT NULL,   -- epoch ms
  action       TEXT NOT NULL,      -- namespaced verb: "node.created", "node.update_failed"
  actor_type   TEXT NOT NULL,      -- "osm_user" | "unknown"
  actor_id     TEXT,               -- OSM uid
  actor_name   TEXT,               -- SNAPSHOT: OSM display name at the time
  subject_type TEXT NOT NULL,      -- "node"
  subject_id   TEXT,               -- "node/123"; NULL when a create never got an id
  metadata     TEXT NOT NULL DEFAULT '{}', -- JSON: changeset, tags, coords, error…
  ip           TEXT,
  user_agent   TEXT
);

-- no FK to `nodes`: the event must outlive the object it talks about
CREATE INDEX IF NOT EXISTS audit_events_time_idx ON audit_events (occurred_at);
CREATE INDEX IF NOT EXISTS audit_events_subject_idx ON audit_events (subject_type, subject_id, occurred_at);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_id, occurred_at);

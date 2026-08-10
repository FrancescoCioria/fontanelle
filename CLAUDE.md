# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

- `yarn start` — Vite dev server (:5173). Proxies `/api` → `localhost:8788`
- `yarn dev:api` — `wrangler pages dev` (:8788): Pages Functions + local D1. Needs `yarn build` first (it serves `dist`)
- `yarn build` — Production build to `dist/`
- `yarn typecheck` — Both projects: browser (`tsconfig.json`) and Functions (`functions/tsconfig.json`)
- `yarn db:init` / `yarn db:init:remote` — Apply `schema.sql` to the local / remote D1
- `yarn deploy` — Deploy to Cloudflare Pages (static build **and** Functions)
- `yarn logs` — Last 30 write events from the D1 audit log (`audit_events`)

Uses Vite with `vite-plugin-pwa` for service worker generation. ⚠️ No Node polyfills: `vite-plugin-node-polyfills` went out with `xml2js` (the write path builds its own XML server-side) — it was an always-loaded ~200 KiB chunk nothing referenced. Verified by grepping the built bundle for `Buffer`/`process`/`stream`; don't re-add it without that check.

## Deployment

Hosted on **Cloudflare Pages** at https://fontanelle.pages.dev, D1 database `fontanelle-db` bound as `DB` (see `wrangler.toml`).

⚠️ Deploy only there. The OSM OAuth `redirect_uri` is registered on that exact domain, so OSM login breaks on any other host. A stale `yarn deploy` script publishing to GitHub Pages was removed for this reason — don't reintroduce a second target. The Mapbox token is stored as a Cloudflare Pages secret (`VITE_MAPBOX_TOKEN`) and locally in `.env` (gitignored). Build with the env var: `VITE_MAPBOX_TOKEN=... yarn build`.

## Architecture

This is a React 18 + TypeScript 5 PWA that displays public amenities (drinking water, toilets, showers, bicycle repair stations, public baths, device charging stations, playgrounds, picnic areas, public elevators) on a Mapbox map using OpenStreetMap data.

Scope note: "fontanelle" is a legacy name — the app is about outdoor amenities generally, increasingly with kids in mind. ⚠️ Renaming is not free: the OSM OAuth `redirect_uri` is hardcoded in `osm.ts` to `https://fontanelle.pages.dev/` and must match the registered OSM app, so changing the *domain* breaks login until both are updated.

### Data Flow

**Server-first.** ⚠️ The browser does not talk to Overpass — it talks to `/api/amenities`, and everything hard (endpoint failover, hedging, retries, concurrency, the shared cache) lives in the Pages Function. This is not a preference: on 2026-07-26, from France, all four public Overpass instances answered a 1km Paris query with a 504 or a >17s response, against a 10s client deadline — an empty map with a generic error toast. The same query through the server now takes ~5s cold and ~10ms warm, for every user. Don't move Overpass calls back into `src/`.

0. **Shared vocabulary** (`shared/amenities.ts`) — Amenity types, `PSEUDO_AMENITIES`, `normalizeElement` and `overpassQuery`, imported by **both** the browser bundle and the Functions. ⚠️ Keep it free of React/DOM/localforage/Node — `functions/tsconfig.json` compiles it against `@cloudflare/workers-types` with no DOM lib, which is what enforces this.
   - **`PSEUDO_AMENITIES`** is the single table for amenities OSM files under a key other than `amenity` (`leisure=playground`, `leisure=picnic_table`, `tourism=picnic_site`, `highway=elevator`). It drives **both** the query branches and `normalizeElement`, so the two can't drift. Add new ones there, not in two places. ⚠️ It must be declared before `editableAmenities`, which reads it at module load.
     - **Writability is a per-entry flag (`writable`), not a property of the table.** The write path serializes the real pair via `toOsmTags` (`amenity=playground` means nothing in OSM; `leisure=playground` is the tag), so a pseudo-amenity is editable as soon as it declares which pair to write. All three pseudo-amenities have it now: `playground` (44% of Italian ones are plain nodes — Overpass 2026-08-10: 10,457 nodes vs 13,343 ways), `elevator` (86% are nodes, taginfo 2026-08-09) and `picnic`.
     - ⚠️ **`picnic` folds in from two tags, so only ONE of them carries the flag** (`leisure=picnic_table`). `osmTagFor` returns undefined unless *exactly one* entry per amenity is writable — flagging `tourism=picnic_site` too doesn't add a choice, it silently disables picnic writes altogether. New picnic objects are always tables: someone dropping a pin from a phone is standing at a table, and an *area* drawn as a single point is a worse map than no point at all.
     - ⚠️ **The app's model is lossy, so an update must not write it back blind.** One rule in `tagsForOsm`: **whatever spelling the object already has, it keeps** — `current` comes free with the version fetch. **Editing an object must never change what kind of object it is.** Three real cases it saves, all silent:
  - `leisure=playground` + `amenity=traffic_park`: the fold drops the foreign `amenity`, so saving would erase it (12 of Italy's 10,457 playground nodes);
  - a `tourism=picnic_site` node would come back `leisure=picnic_table`, retyping an area as a single bench;
  - an `amenity=fountain` shown as drinking water would come back `amenity=drinking_water`, retyping a monument as a tap — and a `building=toilets` would have `amenity=toilets` imposed on it.
     - ⚠️ **A tile already cached is fresh for 30 days, and it was fetched with the old query.** Adding an entry here doesn't retroactively fill those tiles: elevators only appeared everywhere after `DELETE FROM tiles` on the remote D1 (85 rows, 2026-08-09), which costs one lazy refetch per visited tile and leaves `nodes` untouched. Do the same for the next amenity added.
   - **`ALSO_TAGGED_AS`** is the second table: *other people's spellings* for something we already have an amenity for. `amenity=fountain`+`drinking_water=yes` and `fountain=drinking` read as drinking water, `building=toilets` as toilets. Separate from `PSEUDO_AMENITIES` because these are **conditional** — `amenity=fountain` alone is a monument — and because they are **never written**.
     - Why it exists: the basemap draws its own `drinking-water` symbol on these, so the map showed an icon with no pin of ours under it, and the app looked like it was missing data. Measured in Italy 2026-08-10: 1,146 drinkable `amenity=fountain`, 189 `fountain=drinking`, 293 `building=toilets`. Rare per-screen (2 in a 6×5km slice of Milan), which is exactly why it read as a glitch rather than a gap.
     - Deliberately **not** included, though they are drinkable: `man_made=water_tap` (1,357), `natural=spring`+`drinking_water=yes` (1,049), `amenity=water_point` (706). A product call, not an oversight — revisit with the owner, not silently.
     - ⚠️ **`readSpelling` is the single matcher** for "what does this tag set say it is", used both when reading Overpass and when deciding what to write back, so the two can never disagree about what an object already is.
   - `normalizeElement` folds them into a pseudo-amenity (`amenity: "picnic"`) so the rest of the app keeps discriminating on one field. Two rules that both come from real bugs:
     - ⚠️ **A supported `amenity` wins; the pseudo key is only a fallback.** Don't gate it on `!tags.amenity`: `way/583656299` is `leisure=playground` + `amenity=traffic_park`, and keeping the foreign value makes it vanish downstream *and* get cached that way.
     - ⚠️ **Only the key that actually matched is rewritten.** `osmUpdateNode` replaces the whole tag set, so dropping a tag on read deletes it from OSM on save — stripping `leisure` unconditionally would erase `leisure=sauna` from an `amenity=public_bath` node whose fee the user edited.
   - Anything whose final amenity isn't in `amenities` is dropped rather than stored — an unrenderable entry would otherwise sit in D1 and IndexedDB forever.
1. **`GET /api/amenities?lat&lon&radius`** (`functions/api/amenities.ts`) — the only door to OSM.
   - **Tiles are the cache unit** (`functions/lib/tiles.ts`, z12 ≈ 6.9km at lat 45). A `(around:R,lat,lon)` query has an unbounded key, so nothing is ever a hit; snapping to a fixed slippy grid means two users on the same street share the same rows. ⚠️ Changing `TILE_ZOOM` orphans every cached tile (the zoom is in the key) — clear `tiles` if you do.
   - ⚠️ **The radius says how far to *fetch*; the client's `bbox` says how much to *show*.** They used to be the same number, and users could see it: the Mapbox basemap draws its own toilet and fountain symbols across the whole screen while the app drew pins only inside the searched disc — ~3 km² of a ~15 km² phone screen at the default 1km radius and `OPENING_ZOOM`. The rows were mostly in D1 already and discarded on the way out. Measured 2026-08-10, same Milan point, no fetching: 75 nodes at r=1000, **287** once the viewport is sent, at the same 0.2s. A node comes back if it is inside the radius **or** inside the bbox; without a bbox the old disc-only behaviour stands. The bbox is clamped (`MAX_BBOX_DEGREES`) because it is client input.
   - **Reads are by bounding box, writes are by tile.** A node is stored under the tile *containing its point*, not the tile whose query returned it (Overpass returns ways merely touching the bbox). That's what makes "delete what this tile no longer returns" safe, and it's how an amenity deleted in OSM eventually disappears here.
   - ⚠️ **That delete measures against the Overpass answer's own `osm3s.timestamp_osm_base`, NEVER against the clock.** Overpass replicates with a lag (measured 2026-07-26: 1.3–1.9 min), so its answer legitimately lacks a node created a minute ago — deleting against `now` erases exactly the freshest rows, including the edit a user just made through `/api/osm`. Reproduced: the node vanished on the very next tile refresh and, since that refresh marks the tile fresh, stayed gone for the 30-day TTL. Falls back to `now − 15min` if an instance omits the timestamp.
   - ⚠️ **`MAX_REFRESH_PER_REQUEST` caps fetching, never reading.** Everything already cached for the area comes back regardless, or a wide radius would hide its own cached tiles behind its refresh budget.
   - ⚠️ **The response does not wait for Overpass.** After `RESPONSE_BUDGET_MS` (6s) the Function answers with whatever D1 holds, flags `partial: true`, and hands the unfinished fetches to `context.waitUntil` — they land in D1 for the client's follow-up call. `Map.tsx` re-requests on `partial` with a backoff (`PARTIAL_RETRY_DELAYS_MS`), each round returning everything landed so far.
   - `tiles.retry_after` answers one question — "may anyone fetch this tile now?" — and covers both a claim (someone is fetching; don't duplicate) and a cooldown after a failure (don't let the client's retry loop hammer a sick instance). ⚠️ Tiles held this way must count towards `partial`, or the client stops retrying while its data is still in flight.
   - Tile TTL is 30 days. Edits made in the app don't wait for it — see the write path below.
2. **Overpass client** (`functions/lib/overpass.ts`) — ⚠️ endpoints are **hedged, not queued**: after `HEDGE_DELAY_MS` without an answer the next instance is asked *as well*, first good reply wins, losers aborted. Trying them one after another is what failed on 2026-07-26 — two dead instances ate the whole deadline before the one instance actually serving Paris was ever asked. Fixing this took a cold Paris fetch from "all four failed" to 4.8s.
   - ⚠️ Only **world-wide** instances belong in the pool. `overpass.osm.ch` was removed 2026-07-19: it serves Switzerland only, so failing over to it returned `200 []` outside CH — an empty map with no error.
   - ⚠️ A `200` is not a success: Overpass reports "runtime error: query timed out" inside a 200 body and proxies answer HTML. Parse before treating the endpoint as healthy, or an empty tile gets cached for a month.
   - ⚠️ `FETCH_CONCURRENCY` (2) × `MAX_PARALLEL` (3) = the 6 simultaneous outbound connections a Worker gets. Raise either and the extra fetches silently queue, turning the hedge back into the queue it exists to avoid.
3. **Saying which kind of empty** (`DataStatus.tsx`, `tiles` in the response) — ⚠️ the server is deliberately resilient: it answers `200` with whatever it has, failed tiles and all. That is right for the map and useless for the user, because from the browser a dead Overpass and an empty countryside look identical (the bug that prompted this). So the response carries counts, and the banner reads them:
   - `unreachable` (failed now + cooling down from an earlier failure) → amber "OpenStreetMap isn't responding"; copy adapts to whether cached points are on screen
   - `partial` with nothing to show → "Loading this area…"; quiet when there are already markers, since the top loading bar covers it
   - **`!partial && nodes.length === 0` → "Nothing mapped in this area"** — a claim, made only because the server reports every tile covering the area as fresh
   - the request itself throwing → "You're offline — showing saved points"
   ⚠️ `held` (someone is fetching) and `cooling` (it just failed) must stay separate server-side: collapsing them made the app say "loading…" indefinitely while Overpass was down, which reads exactly like an empty area.
4. **Local cache** (`localforage`, key `CACHE_KEY`) — everything the server returns is also cached in IndexedDB, keyed by `nodeKey` (`type/id` — `way/42` and `node/42` are different objects), and shown immediately on map move while fresh data loads. It is an **offline convenience, not the source of truth**. Bump `CACHE_KEY` when the cached shape changes; v1 entries predated `elementType` and could never be evicted.
5. **Map markers** — `Map.tsx` uses a Mapbox GeoJSON source + symbol layer. Amenity nodes are converted to GeoJSON features with pre-registered icon sprites.
   - `mergeNearbyNodes` collapses near-duplicate objects into one marker at the group midpoint, **per amenity** via `MERGE_RADIUS_METERS` (`playground` 50m, `picnic` 20m). OSM routinely maps a playground as both an area and a node inside it, or one node per slide, and picnic tables come in rows — in Milan samples, 51/131 playgrounds had a peer within 50m and 164/195 picnic objects had one within 20m (195 pins → ~71 places). Two fountains 20m apart, by contrast, are genuinely two fountains, so don't make this global. Single-linkage, and the representative is the richest object (area > node, then most tags, then lowest id).
     - Elevators are deliberately **not** merged, and that was measured, not assumed: of 206 Milan lifts only 82 have a neighbour within 20m, and the curve never plateaus (182 pins at 5m → 158 at 20m → 132 at 50m), so there is no radius that means "same object". Which lift you walk to matters, unlike which picnic table.
   - Merging runs when building features, not when fetching, so objects already in IndexedDB collapse too and nothing is lost from the cache.
   - **One GeoJSON source per amenity** (`sourceId(amenity)`), each with `cluster: true`. ⚠️ This is load-bearing, not incidental: Mapbox clusters *per source*, so a single shared source merges a fountain and a playground into one anonymous "5" bubble. Per-source clustering is what lets a cluster keep its amenity icon and read as "5 fountains". Don't consolidate the sources.
   - ⚠️ `CLUSTER_RADIUS` (30px) is a **legibility** knob, not a perf one: a cluster's centroid sits among its members, so a wide radius parks the bubble between them — in a different block than anything it represents. Measured around Turro at z13, 50px gave a median drift of 108m and a worst case of 243m; 30px cuts that to 32m / 108m with the same number of bubbles. Raise it only with that measurement in hand.
   - Layers per amenity: `clusterLayerId` (filter `has point_count`, amenity icon + count badge) and `markerLayerId` (filter `!has point_count`). ⚠️ **All cluster layers are added first, then all marker layers**, so every marker paints above every cluster. Interleaving them per-amenity lets one type's cluster cover another type's marker while the tap handler — which checks markers first — still resolves to the hidden marker underneath.
   - ⚠️ `text-offset` on the count badge is in ems of `text-size`, so it must step in lockstep with `icon-size` or the badge drifts onto the icon on big clusters.
   - ⚠️ **Amenity filtering happens when building the features, NOT via `map.setFilter`.** Mapbox clusters at the source level, so a layer filter would hide markers while still counting them in the bubbles. Never re-add a `setFilter` on the marker layers — it would also clobber the hardcoded cluster-exclusion filter.
   - `setData` is skipped for sources whose serialized data is unchanged: it rebuilds that source's supercluster index and invalidates its cluster ids, which races the tap handler (see below).
   - ⚠️ `mapRef.current` is published only *after* the sources exist. Setting it before the `await registerMapIcons` completes lets `updateGeoJsonSource` run and silently no-op on missing sources, losing markers until the next pan.
   - ⚠️ **One global click handler, not per-layer ones.** `map.on("click", layer, …)` registers independent delegated listeners that don't suppress each other, so a tap on an icon overlapping a cluster bubble would open the sheet *and* zoom away. Markers take precedence; taps are ignored entirely while `UpsertNode` is picking coordinates (the picker overlay is `pointerEvents: none`, so the map stays live and a stray `easeTo` would move the pin being placed).
   - ⚠️ `getClusterExpansionZoom` cluster ids are invalidated by every `setData`; a refresh landing between tap and reply errors out, so the handler falls back to a coarse zoom-in instead of silently doing nothing.

### OSM Integration (`osm.ts`)

Authenticated users can create, update, and delete OSM nodes. **Write path is node-only**: `isEditable` gates it to plain nodes with an editable amenity, and `editableAmenities` gates the add menu. Anything mapped as a way/relation is read-only whatever its amenity — most playgrounds are areas, and the ones that aren't can be edited like any other node. Every amenity the app renders can now be added. `osm-auth` handles OAuth2 in singlepage mode (redirect-based, no popup); the OAuth app is a public client (no client_secret).

**`POST /api/osm` runs the whole mutation server-side** (`functions/api/osm.ts`): create changeset → read current version → PUT/DELETE → close changeset → **read the node back from the OSM API** → write that into D1.

- ⚠️ **The read-back is the point.** Overpass lags OSM by minutes, so a server that only learned "something changed here" and re-asked Overpass would get an answer that predates the edit — and mark the tile fresh for 30 days. `api.openstreetmap.org` is the only source that already knows. What lands in D1 is what OSM returns, never what the client sent.
- ⚠️ The row is stamped with the wall clock, and `writeTile` deletes against the Overpass *data* timestamp — that pairing is what keeps the next tile refresh from wiping the edit. Breaking either half re-opens the bug (reproduced 2026-07-26).
- The user's bearer token rides in `Authorization` and is forwarded to OSM; never stored, never logged. The client gets it there via `osmAuth.fetch`, which attaches the header to any URL — ⚠️ don't hand-read the token out of localStorage, the key is osm-auth's private business.
- `validate()` repeats the editable-amenity gate server-side: the endpoint is reachable without the add menu. It is not "only `amenity=*` is writable" — `toOsmTags` handles the real pair — but "nothing whose OSM spelling this app can't name for certain".
- The changeset comment names the tag actually written (`Add leisure=playground`), not the app's internal amenity: a changeset claiming a tag that doesn't exist is a lie to the next mapper reading the history.
- XML is hand-built with `escapeXml` rather than pulling in a builder — the grammar is four attributes and a flat tag list, and every value is user text (`Bar "Le Rêve" & co` in `operator` must not produce a malformed changeset). Removing `xml2js` also took it out of the browser bundle.
- Errors forward OSM's own status and message (409 version conflict, 401 expired token); `UpsertNode` shows it instead of "please try again", which on a 409 would just loop.

**Write log (`audit_events`, `functions/lib/audit.ts`)** — every attempted mutation is recorded: `node.created` / `node.updated` / `node.deleted`, and `node.<action>_failed` with OSM's own status and message. Read it with `yarn logs`.

- ⚠️ **Append-only, and nothing reads it to decide anything.** State lives in `nodes`/`tiles`; this is history for a human. Reading it to drive logic is the line between "CRUD + event logging" and event sourcing — stay on this side.
- It exists because `console.log` in a Pages Function is only visible to a `wrangler tail` attached *at that moment*: real user edits left nothing to inspect afterwards.
- Actor is a **snapshot** (OSM uid + display name at the time, from `/api/0.6/user/details.json`), and there is no FK to `nodes` — the event has to outlive the object and the rename.
- `recordEvent` is best-effort and never awaited into the failure path: the mutation happened on a remote server, so it can't be atomic with the log, and losing a log line must not turn a successful edit into an error.
- ⚠️ Only *authenticated, validated* attempts are logged. 400/401 rejections are not, or an unauthenticated POST loop could inflate the table at will.
- `whoami` fails fast on 401 **before** the changeset is opened — a changeset that can never be filled is litter on OSM. Other errors there only cost the actor's name.

`BottomSheet`'s single-node refresh still reads `openstreetmap.org` directly, best-effort (`.catch(() => {})`) — it's a read, and that host is reliable.

### Key Types

- `OpenStreetMapNode` — Core data type: `{ id, lat, lon, tags: AmenityTags, elementType? }`. Despite the name it may be a way/relation, in which case `lat`/`lon` are the `out center` centroid and the element is read-only.
- `Amenity` — Union type: `"drinking_water" | "toilets" | "shower" | "bicycle_repair_station" | "public_bath" | "device_charging_station" | "playground" | "picnic" | "elevator"`
- `AmenityTags` — Discriminated union on `amenity` field, each variant with amenity-specific optional tags

### Component Structure

- **`shared/amenities.ts`** — Amenity vocabulary, `normalizeElement`, `overpassQuery`. Shared with the Functions; no React/DOM/Node
- **`functions/api/amenities.ts`** — The read endpoint (tile freshness, refresh budget, `partial`/`waitUntil`)
- **`functions/api/osm.ts`** — The write endpoint (changeset, mutation, read-back, D1 update)
- **`functions/lib/{tiles,overpass,store}.ts`** — Slippy-tile maths, hedged Overpass client, D1 access
- **`getOpenStreetMapAmenities.tsx`** — Browser side: calls `/api/amenities`, keeps the IndexedDB copy, `mergeNearbyNodes`, marker/colour helpers. Re-exports the `shared/` vocabulary so the rest of `src/` has one import site
- **`App.tsx`** — Root: renders ServiceWorkerWrapper + Map. Handles OAuth redirect callback (completes token exchange when returning with `?code=`)
- **`Map.tsx`** — Functional component. Owns map instance (`useRef`), node cache, search radius. Handles Mapbox initialization, GeoJSON source/layer amenity rendering, amenity fetching with debounce. Renders filter pills, menu button, add button, and search-this-area button
  - **Two zooms, on purpose**: `OPENING_ZOOM` (13) is where the app opens and where it stays while following you — at the default 1km radius that's exactly the zoom where the searched circle fits a phone screen. `LOCATE_ZOOM` (15) is only reached by *pressing* the locate button.
  - ⚠️ `OPENING_ZOOM` is also the control's permanent `fitBoundsOptions.maxZoom`, and that's load-bearing: with `trackUserLocation`, Mapbox re-fits the camera on **every** position update, so a higher cap makes the map silently zoom in on the user as they walk (measured: 500m scale → 100m after two GPS ticks). Don't "fix" the button by raising the cap.
  - ⚠️ The button's zoom-in is applied on the **position event**, flagged from `trackuserlocationstart` — not in the start handler itself, because the control fits the camera right after and would undo it. The flag skips the app's own opening trigger via `gpsResolvedRef`.
- **`BottomSheet.tsx`** — Node detail view using vaul Drawer with drag handle. Shows amenity tags, directions link, edit button. Fetches fresh node data from OSM API on open
- **`UpsertNode.tsx`** — Create/update/delete node flow. Two-phase UX: first pick coordinates (crosshair on map), then fill form. Renders different forms based on amenity type
- **`Popup.tsx`** — Generic modal overlay with backdrop blur and slide-up animation
- **`form.tsx`** — Reusable form components: Button (default/primary/danger variants), Select, Input, Checkbox
- **`store.ts`** — Zustand store for app state (opened node, filters, menu states, search settings)
- **Marker components** (`DrinkingWaterMarker.tsx`, etc.) — SVG icons. Color indicates status: white=open, gold=fee, grey=closed/not-public
  - **Attribute variants, not extra pin types**: `changing_table=yes` renders toilets as a `toilets-baby-<color>` sprite (baby badge) instead of `toilets-<color>`. A changing table is a property of a toilet, not a place — the dedicated `amenity=nursing_room` tag is dead (115 objects worldwide). Same pattern if `wheelchair`/`stroller` filters are ever wanted.
  - ⚠️ Every name `getIconName` can return must be registered in `registerMapIcons`; a missing sprite is an invisible marker with no error. Keep color-variant families inside the `COLORS` loop.
  - Icons must read at **~24px**, the rendered marker size. Detailed artwork (multiple figures, fine strokes) turns to mush — verify at that size before committing, not just large.

### Design System (`map.scss`)

Mobile-first design with design tokens: primary (#0ea5e9), danger (#ef4444), consistent shadows, border-radius (10/16/24px), 44px touch targets. Filter pills are color-coded per amenity type and horizontally scrollable. Z-index scale: map controls (100), popups (10000), toasts (10001).

### Notable Patterns

- Mapbox GL JS is loaded globally (`window.mapboxgl`), not as an npm import. Type declarations reference `@types/mapbox-gl`.
- Mapbox access token loaded from `import.meta.env.VITE_MAPBOX_TOKEN`.
- `mapbox-gl-circle` and `osm-auth` have custom type declarations in `typings/`.
- Marker color logic in `getAmenityMarker` checks opening hours (via `opening_hours` lib), access restrictions, and fee status.
- Default coordinates are Milan, Italy (45.4642, 9.19).

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

- `yarn start` — Start Vite dev server
- `yarn build` — Production build to `dist/`
- `yarn preview` — Preview production build locally
- `npx wrangler pages deploy dist --project-name fontanelle` — Deploy to Cloudflare Pages

Uses Vite with `vite-plugin-pwa` for service worker generation and `vite-plugin-node-polyfills` for Node polyfills (timers, buffer, stream).

## Deployment

Hosted on **Cloudflare Pages** at https://fontanelle.pages.dev.

⚠️ Deploy only there. The OSM OAuth `redirect_uri` is registered on that exact domain, so OSM login breaks on any other host. A stale `yarn deploy` script publishing to GitHub Pages was removed for this reason — don't reintroduce a second target. The Mapbox token is stored as a Cloudflare Pages secret (`VITE_MAPBOX_TOKEN`) and locally in `.env` (gitignored). Build with the env var: `VITE_MAPBOX_TOKEN=... yarn build`.

## Architecture

This is a React 18 + TypeScript 5 PWA that displays public amenities (drinking water, toilets, showers, bicycle repair stations, public baths, device charging stations, playgrounds, picnic areas) on a Mapbox map using OpenStreetMap data.

Scope note: "fontanelle" is a legacy name — the app is about outdoor amenities generally, increasingly with kids in mind. ⚠️ Renaming is not free: the OSM OAuth `redirect_uri` is hardcoded in `osm.ts` to `https://fontanelle.pages.dev/` and must match the registered OSM app, so changing the *domain* breaks login until both are updated.

### Data Flow

1. **Overpass API** (`getOpenStreetMapAmenities.tsx`) — Queries OSM Overpass API for amenities within a radius around the map center. Uses a single unified query with two branches: `amenity~^(…)$` and `leisure=playground`. Ends with `out center;` so ways/relations get a representative point (most playgrounds are areas). A pool of 4 public Overpass endpoints provides automatic failover on 429/5xx errors. Previous in-flight requests are aborted when a new one starts.
   - ⚠️ Only **world-wide** instances belong in the pool. `overpass.osm.ch` was removed 2026-07-19: it serves Switzerland only, so failing over to it returned `200 []` outside CH — an empty map with no error.
   - **`PSEUDO_AMENITIES`** is the single table for amenities OSM files under a key other than `amenity` (`leisure=playground`, `leisure=picnic_table`, `tourism=picnic_site`). It drives **both** the query branches and `normalizeElement`, so the two can't drift. Add new ones there, not in two places. ⚠️ It must be declared before `editableAmenities`, which reads it at module load.
   - `normalizeElement` folds them into a pseudo-amenity (`amenity: "picnic"`) so the rest of the app keeps discriminating on one field. Two rules that both come from real bugs:
     - ⚠️ **A supported `amenity` wins; the pseudo key is only a fallback.** Don't gate it on `!tags.amenity`: `way/583656299` is `leisure=playground` + `amenity=traffic_park`, and keeping the foreign value makes it vanish downstream *and* get cached that way.
     - ⚠️ **Only the key that actually matched is rewritten.** `osmUpdateNode` replaces the whole tag set, so dropping a tag on read deletes it from OSM on save — stripping `leisure` unconditionally would erase `leisure=sauna` from an `amenity=public_bath` node whose fee the user edited.
   - Anything whose final amenity isn't in `amenities` is dropped rather than cached — an unrenderable entry would otherwise sit in IndexedDB forever.
   - `mergeNearbyNodes` collapses near-duplicate objects into one marker at the group midpoint, **per amenity** via `MERGE_RADIUS_METERS` (`playground` 50m, `picnic` 20m). OSM routinely maps a playground as both an area and a node inside it, or one node per slide, and picnic tables come in rows — in Milan samples, 51/131 playgrounds had a peer within 50m and 164/195 picnic objects had one within 20m (195 pins → ~71 places). Two fountains 20m apart, by contrast, are genuinely two fountains, so don't make this global. Single-linkage, and the representative is the richest object (area > node, then most tags, then lowest id).
   - Merging runs when building features, not when fetching, so objects already in IndexedDB collapse too and nothing is lost from the cache.
2. **Local cache** (`localforage`, key `CACHE_KEY`) — All fetched nodes are cached in IndexedDB, keyed by `nodeKey` (`type/id` — `way/42` and `node/42` are different objects). Bump `CACHE_KEY` when the cached shape changes; v1 entries predated `elementType` and could never be evicted. On map move, cached nodes in the current radius are shown immediately while fresh data loads.
3. **Map markers** — `Map.tsx` uses a Mapbox GeoJSON source + symbol layer. Amenity nodes are converted to GeoJSON features with pre-registered icon sprites.
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

Authenticated users can create, update, and delete OSM nodes via the OSM API. **Write path is node-only**: `isEditable` gates it to plain nodes with an editable amenity, and `editableAmenities` gates the add menu. Playgrounds are read-only (they live under `leisure=*`, which this path can't serialize back), as is anything mapped as a way/relation. Uses `osm-auth` for OAuth2 in singlepage mode (redirect-based, no popup). The OAuth app is configured as a public client (no client_secret). All mutations are wrapped in changesets. Node data is serialized to XML via `xml2js` Builder.

### Key Types

- `OpenStreetMapNode` — Core data type: `{ id, lat, lon, tags: AmenityTags, elementType? }`. Despite the name it may be a way/relation, in which case `lat`/`lon` are the `out center` centroid and the element is read-only.
- `Amenity` — Union type: `"drinking_water" | "toilets" | "shower" | "bicycle_repair_station" | "public_bath" | "device_charging_station" | "playground"`
- `AmenityTags` — Discriminated union on `amenity` field, each variant with amenity-specific optional tags

### Component Structure

- **`App.tsx`** — Root: renders ServiceWorkerWrapper + Map. Handles OAuth redirect callback (completes token exchange when returning with `?code=`)
- **`Map.tsx`** — Functional component. Owns map instance (`useRef`), node cache, search radius. Handles Mapbox initialization, GeoJSON source/layer amenity rendering, amenity fetching with debounce. Renders filter pills, menu button, add button, and search-this-area button
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

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

- `yarn start` — Start Vite dev server
- `yarn build` — Production build to `dist/`
- `yarn preview` — Preview production build locally
- `npx wrangler pages deploy dist --project-name fontanelle` — Deploy to Cloudflare Pages

Uses Vite with `vite-plugin-pwa` for service worker generation and `vite-plugin-node-polyfills` for Node polyfills (timers, buffer, stream).

## Deployment

Hosted on **Cloudflare Pages** at https://fontanelle.pages.dev. The Mapbox token is stored as a Cloudflare Pages secret (`VITE_MAPBOX_TOKEN`) and locally in `.env` (gitignored). Build with the env var: `VITE_MAPBOX_TOKEN=... yarn build`.

## Architecture

This is a React 18 + TypeScript 5 PWA that displays public amenities (drinking water, toilets, showers, bicycle repair stations, public baths, device charging stations, playgrounds) on a Mapbox map using OpenStreetMap data.

### Data Flow

1. **Overpass API** (`getOpenStreetMapAmenities.tsx`) — Queries OSM Overpass API for amenities within a radius around the map center. Uses a single unified query with two branches: `amenity~^(…)$` and `leisure=playground`. Ends with `out center;` so ways/relations get a representative point (most playgrounds are areas). A pool of 4 public Overpass endpoints provides automatic failover on 429/5xx errors. Previous in-flight requests are aborted when a new one starts.
   - ⚠️ Only **world-wide** instances belong in the pool. `overpass.osm.ch` was removed 2026-07-19: it serves Switzerland only, so failing over to it returned `200 []` outside CH — an empty map with no error.
   - `normalizeElement` folds `leisure=playground` into the pseudo-amenity `amenity: "playground"` so the rest of the app keeps discriminating on one field. ⚠️ It rewrites `leisure` **only** on actual playgrounds: `osmUpdateNode` replaces the whole tag set, so dropping a tag on read deletes it from OSM on save.
2. **Local cache** (`localforage`, key `CACHE_KEY`) — All fetched nodes are cached in IndexedDB, keyed by `nodeKey` (`type/id` — `way/42` and `node/42` are different objects). Bump `CACHE_KEY` when the cached shape changes; v1 entries predated `elementType` and could never be evicted. On map move, cached nodes in the current radius are shown immediately while fresh data loads.
3. **Map markers** — `Map.tsx` uses a Mapbox GeoJSON source + symbol layer. Amenity nodes are converted to GeoJSON features with pre-registered icon sprites.
   - **Clustering** is native (`cluster: true`, `CLUSTER_MAX_ZOOM`): at and below z14 nearby amenities collapse into a numbered bubble (`CLUSTERS_LAYER` + `CLUSTER_COUNT_LAYER`), above it individual icons show (`AMENITIES_LAYER`, filtered on `!has point_count`).
   - ⚠️ **Amenity filtering happens when building the features, NOT via `map.setFilter`.** Mapbox clusters at the source level, so a layer filter would hide markers while still counting them in the bubbles. Never re-add a `setFilter` on `AMENITIES_LAYER` — it would also clobber the hardcoded cluster-exclusion filter.
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

### Design System (`map.scss`)

Mobile-first design with design tokens: primary (#0ea5e9), danger (#ef4444), consistent shadows, border-radius (10/16/24px), 44px touch targets. Filter pills are color-coded per amenity type and horizontally scrollable. Z-index scale: map controls (100), popups (10000), toasts (10001).

### Notable Patterns

- Mapbox GL JS is loaded globally (`window.mapboxgl`), not as an npm import. Type declarations reference `@types/mapbox-gl`.
- Mapbox access token loaded from `import.meta.env.VITE_MAPBOX_TOKEN`.
- `mapbox-gl-circle` and `osm-auth` have custom type declarations in `typings/`.
- Marker color logic in `getAmenityMarker` checks opening hours (via `opening_hours` lib), access restrictions, and fee status.
- Default coordinates are Milan, Italy (45.4642, 9.19).

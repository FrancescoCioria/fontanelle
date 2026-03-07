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

This is a React 18 + TypeScript 5 PWA that displays public amenities (drinking water, toilets, showers, bicycle repair stations, public baths, device charging stations) on a Mapbox map using OpenStreetMap data.

### Data Flow

1. **Overpass API** (`getOpenStreetMapAmenities.tsx`) — Queries OSM Overpass API for amenities within a radius around the map center. Uses a single unified query. A pool of 5 public Overpass endpoints provides automatic failover on 429/5xx errors. Previous in-flight requests are aborted when a new one starts.
2. **Local cache** (`localforage`) — All fetched nodes are cached in IndexedDB. On map move, cached nodes in the current radius are shown immediately while fresh data loads.
3. **Map markers** — `Map.tsx` uses a Mapbox GeoJSON source + symbol layer. Amenity nodes are converted to GeoJSON features with pre-registered icon sprites. Filtering is done via Mapbox layer filters.

### OSM Integration (`osm.ts`)

Authenticated users can create, update, and delete OSM nodes via the OSM API. Uses `osm-auth` for OAuth2 in singlepage mode (redirect-based, no popup). The OAuth app is configured as a public client (no client_secret). All mutations are wrapped in changesets. Node data is serialized to XML via `xml2js` Builder.

### Key Types

- `OpenStreetMapNode` — Core data type: `{ id, lat, lon, tags: AmenityTags }`
- `Amenity` — Union type: `"drinking_water" | "toilets" | "shower" | "bicycle_repair_station" | "public_bath" | "device_charging_station"`
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

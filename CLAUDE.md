# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

- `yarn start` — Start Vite dev server
- `yarn build` — Production build to `dist/`
- `yarn preview` — Preview production build locally
- `yarn deploy` — Build + deploy to GitHub Pages via gh-pages

Uses Vite with `vite-plugin-pwa` for service worker generation and `vite-plugin-node-polyfills` for Node polyfills (timers, buffer, stream).

## Architecture

This is a React 18 + TypeScript 5 PWA that displays public amenities (drinking water, toilets, showers, bicycle repair stations, public baths, device charging stations) on a Mapbox map using OpenStreetMap data.

### Data Flow

1. **Overpass API** (`getOpenStreetMapAmenities.tsx`) — Queries OSM Overpass API for amenities within a radius around the map center. Splits amenity types into two parallel requests.
2. **Local cache** (`localforage`) — All fetched nodes are cached in IndexedDB. On map move, cached nodes in the current radius are shown immediately while fresh data loads.
3. **Map markers** — `Map.tsx` uses a Mapbox GeoJSON source + symbol layer. Amenity nodes are converted to GeoJSON features with pre-registered icon sprites. Filtering is done via Mapbox layer filters.

### OSM Integration (`osm.ts`)

Authenticated users can create, update, and delete OSM nodes via the OSM API. Uses `osm-auth` for OAuth2 (client credentials in `osm.ts`). All mutations are wrapped in changesets. Node data is serialized to XML via `xml2js` Builder.

### Key Types

- `OpenStreetMapNode` — Core data type: `{ id, lat, lon, tags: AmenityTags }`
- `Amenity` — Union type: `"drinking_water" | "toilets" | "shower" | "bicycle_repair_station" | "public_bath" | "device_charging_station"`
- `AmenityTags` — Discriminated union on `amenity` field, each variant with amenity-specific optional tags

### Component Structure

- **`App.tsx`** — Root: renders ServiceWorkerWrapper + Map
- **`Map.tsx`** — Functional component. Owns all state: map instance (`useRef`), node cache, filters, search radius. Handles Mapbox initialization, GeoJSON source/layer amenity rendering, amenity fetching with debounce
- **`BottomSheet.tsx`** — Node detail view using vaul Drawer. Shows amenity tags, directions link, edit button. Fetches fresh node data from OSM API on open
- **`UpsertNode.tsx`** — Create/update/delete node flow. Two-phase UX: first pick coordinates (crosshair on map), then fill form. Renders different forms based on amenity type
- **`Popup.tsx`** — Generic modal overlay
- **`form.tsx`** — Reusable form components (Button, Select, Input, Checkbox)
- **Marker components** (`DrinkingWaterMarker.tsx`, etc.) — SVG icons. Color indicates status: white=open, gold=fee, grey=closed/not-public

### Notable Patterns

- Mapbox GL JS is loaded globally (`window.mapboxgl`), not as an npm import. Type declarations reference `@types/mapbox-gl`.
- `mapbox-gl-circle` and `osm-auth` have custom type declarations in `typings/`.
- Marker color logic in `getAmenityMarker` checks opening hours (via `opening_hours` lib), access restrictions, and fee status.
- Default coordinates are Milan, Italy (45.4642, 9.19).

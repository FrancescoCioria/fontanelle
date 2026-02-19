/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

import mapboxgl from "mapbox-gl";

declare global {
  interface Window {
    mapboxgl: typeof mapboxgl;
  }
}

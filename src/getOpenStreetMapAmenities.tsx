import * as localforage from "localforage";
import uniqBy from "lodash/uniqBy";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import PublicToiletsMarker from "./PublicToiletsMarker";
import PublicShowerMarker from "./PublicShowerMarker";
import BicycleRepairStationMarker from "./BicycleRepairStationMarker";
import PublicBathMarker from "./PublicBathMarker";
import DeviceChargingStationMarker from "./DeviceChargingStationMarker";
import PlaygroundMarker from "./PlaygroundMarker";
import OpeningHours from "opening_hours";

import "localforage-getitems";

export type AmenityTags = { mapillary?: string } & (
  | {
      amenity: "drinking_water";
      indoor?: "yes" | "no";
    }
  | {
      amenity: "toilets";
      access?: "yes" | "public" | "permissive" | "unknown";
      changing_table?: "yes" | "no" | "unknown";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
      wheelchair?: "yes" | "no" | "unknown" | "limited";
      unisex?: "yes" | "male" | "female";
      opening_hours?: string;
      "toilets:disposal"?: "flush" | "chemical" | "pitlatrine";
      indoor?: "yes" | "no";
    }
  | {
      amenity: "shower";
      access?: "yes" | "public" | "permissive" | "unknown";
      hot_water?: "yes" | "no" | "unknown";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
      wheelchair?: "yes" | "no" | "unknown" | "limited";
      opening_hours?: string;
      indoor?: "yes" | "no";
    }
  | {
      amenity: "public_bath";
      access?: "yes" | "public" | "permissive" | "unknown";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
      opening_hours?: string;
      indoor?: "yes" | "no";
    }
  | {
      amenity: "bicycle_repair_station";
      indoor?: "yes" | "no";
    }
  | {
      amenity: "device_charging_station";
      indoor?: "yes" | "no";
    }
  // OSM tags playgrounds as `leisure=playground`, not `amenity=*`.
  // We normalize them into this pseudo-amenity when parsing the Overpass
  // response — see `normalizeElement`.
  | {
      amenity: "playground";
      name?: string;
      access?: "yes" | "public" | "permissive" | "unknown" | "private";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
      opening_hours?: string;
      min_age?: string;
      max_age?: string;
      surface?: string;
      wheelchair?: "yes" | "no" | "unknown" | "limited";
      fenced?: "yes" | "no";
      lit?: "yes" | "no";
      indoor?: "yes" | "no";
    }
);

/**
 * Despite the name, this can also be a way or a relation (playgrounds are
 * usually mapped as areas). `lat`/`lon` are then the geometric center, and
 * the element is read-only — see `isEditable`.
 */
export type OpenStreetMapNode = {
  id: number;
  lat: number;
  lon: number;
  tags: AmenityTags;
  elementType?: "node" | "way" | "relation";
};

/** Unique across element types: way/123 and node/123 are different objects. */
export const nodeKey = (node: OpenStreetMapNode): string =>
  `${node.elementType || "node"}/${node.id}`;

/**
 * Playgrounds are read-only: they live under `leisure=playground`, which the
 * OSM write path (`osm.ts`) doesn't know how to serialize back.
 */
const isEditableAmenity = (amenity: Amenity) => amenity !== "playground";

/** Only plain nodes we know how to tag back can be created/edited/deleted. */
export const isEditable = (node: OpenStreetMapNode): boolean =>
  (node.elementType || "node") === "node" &&
  isEditableAmenity(node.tags.amenity);

const amenitiesMap: { [k in Amenity]: Amenity } = {
  drinking_water: "drinking_water",
  shower: "shower",
  toilets: "toilets",
  public_bath: "public_bath",
  bicycle_repair_station: "bicycle_repair_station",
  device_charging_station: "device_charging_station",
  playground: "playground"
};

export const amenities = Object.values(amenitiesMap);

/** Amenities the user can add from the app. */
export const editableAmenities = amenities.filter(isEditableAmenity);

export type Amenity = AmenityTags["amenity"];

export type Options = {
  around: number;
  lat: number;
  lng: number;
};

// Bumped when the cached shape changes: v1 entries predate `elementType`, so
// the same way would be stored twice (as `node/42` and `way/42`) and the stale
// copy — which has no coordinates — could never be evicted.
export const CACHE_KEY = "amenities-v2";

localforage.removeItem("amenities");

export const updateCachedItems = async (newNodes: OpenStreetMapNode[]) => {
  const cachedItems =
    (await localforage.getItem<OpenStreetMapNode[]>(CACHE_KEY)) || [];

  const nodes = uniqBy(newNodes.concat(cachedItems), nodeKey);

  // fire&forget
  localforage.setItem(CACHE_KEY, nodes);
};

// ⚠️ Only world-wide instances. overpass.osm.ch was removed 2026-07-19: it only
// serves Switzerland, so failing over to it returned `200 []` for Milan — an
// empty map with no error.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

let currentEndpointIndex = 0;

const fetchWithRetry = async (
  query: string,
  signal?: AbortSignal,
  around?: number
): Promise<Response> => {
  const timeoutMs = Math.min(
    10000 + ((around || 1000) - 1000) * (20000 / 9000),
    30000
  );
  const totalAttempts = OVERPASS_ENDPOINTS.length;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const endpoint =
      OVERPASS_ENDPOINTS[
        (currentEndpointIndex + attempt) % OVERPASS_ENDPOINTS.length
      ];

    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      const combinedSignal = signal
        ? AbortSignal.any([signal, timeout])
        : timeout;
      const res = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
        signal: combinedSignal
      });

      if (res.ok) {
        // Remember this working endpoint for next time
        currentEndpointIndex =
          (currentEndpointIndex + attempt) % OVERPASS_ENDPOINTS.length;
        return res;
      }

      if (res.status === 429 || res.status >= 500) {
        // Try next endpoint
        continue;
      }

      throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
    } catch (e) {
      if (signal?.aborted) throw e;
      if (attempt === totalAttempts - 1) throw e;
      // Network error — try next endpoint
    }
  }

  throw new Error("All Overpass API endpoints failed");
};

let currentRequest: AbortController | null = null;

/** Overpass element as returned by `out center` (ways/relations have no lat/lon). */
export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: { [k: string]: string };
};

export const normalizeElement = (
  element: OverpassElement
): OpenStreetMapNode | null => {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  if (!element.tags || lat === undefined || lon === undefined) return null;

  // ⚠️ Only rewrite `leisure` on actual playgrounds. Tags we drop here are also
  // dropped on save (osmUpdateNode replaces the whole tag set), so stripping
  // `leisure` unconditionally would delete e.g. `leisure=sauna` from a
  // `amenity=public_bath` node the user merely edits the fee of.
  const { leisure, ...rest } = element.tags;
  const tags = (
    leisure === "playground" ? { ...rest, amenity: "playground" } : element.tags
  ) as AmenityTags;

  if (!tags.amenity) return null;

  return { id: element.id, lat, lon, elementType: element.type, tags };
};

export default async (options: Options): Promise<OpenStreetMapNode[]> => {
  if (currentRequest) {
    currentRequest.abort();
  }

  const controller = new AbortController();
  currentRequest = controller;

  const around = `(around:${options.around},${options.lat},${options.lng})`;
  const osmAmenities = amenities.filter(a => a !== "playground");

  // `out center` gives areas (most playgrounds are ways/relations) a single
  // representative point instead of their full geometry
  const query = `
    [out:json];
    (
      nwr["amenity"~"^(${osmAmenities.join("|")})$"]${around};
      nwr["leisure"="playground"]${around};
    );
    out center;
  `;

  try {
    const res = await fetchWithRetry(query, controller.signal, options.around);

    const json: { elements: OverpassElement[] } = await res.json();

    const nodes = json.elements
      .map(normalizeElement)
      .filter((n): n is OpenStreetMapNode => n !== null);

    updateCachedItems(nodes);

    return nodes;
  } finally {
    if (currentRequest === controller) {
      currentRequest = null;
    }
  }
};

export const getAmenityColor = (amenityTags: AmenityTags): string => {
  const disabledColor = "#d0d0d0";

  const closed = (): string | null => {
    try {
      if ("opening_hours" in amenityTags && amenityTags.opening_hours) {
        const oh = new OpeningHours(amenityTags.opening_hours);

        return oh.getUnknown() ? null : oh.getState() ? null : disabledColor;
      }

      return null;
    } catch (e) {
      return null;
    }
  };

  const notPublic = (): string | null => {
    return "access" in amenityTags &&
      amenityTags.access &&
      !["yes", "public", "unknown", "permissive"].includes(amenityTags.access)
      ? disabledColor
      : null;
  };

  const feeRequired = (): string | null => {
    return "fee" in amenityTags &&
      typeof amenityTags.fee === "string" &&
      amenityTags.fee !== "no"
      ? "gold"
      : null;
  };

  return closed() || notPublic() || feeRequired() || "white";
};

export const getAmenityIcon = (amenity: Amenity, size: number): JSX.Element =>
  getAmenityMarker({ amenity } as AmenityTags, size);

export const getAmenityMarker = (
  amenityTags: AmenityTags,
  size: number
): JSX.Element => {
  const color = getAmenityColor(amenityTags);

  switch (amenityTags.amenity) {
    case "drinking_water":
      return <DrinkingWaterMarker size={size} />;
    case "toilets":
      return <PublicToiletsMarker size={size} color={color} />;
    case "shower":
      return <PublicShowerMarker size={size} color={color} />;
    case "bicycle_repair_station":
      return <BicycleRepairStationMarker size={size} />;
    case "public_bath":
      return <PublicBathMarker size={size} color={color} />;
    case "device_charging_station":
      return <DeviceChargingStationMarker size={size} />;
    case "playground":
      return <PlaygroundMarker size={size} color={color} />;
  }
};

export const getAmenityTitle = (amenity: Amenity): string => {
  switch (amenity) {
    case "drinking_water":
      return "Drinking Water";
    case "toilets":
      return "Public Toilets";
    case "shower":
      return "Public Shower";
    case "bicycle_repair_station":
      return "Bicycle Repair Station";
    case "public_bath":
      return "Public Bath";
    case "device_charging_station":
      return "Phone Charging Station";
    case "playground":
      return "Playground";
  }
};

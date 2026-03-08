import * as localforage from "localforage";
import uniqBy from "lodash/uniqBy";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import PublicToiletsMarker from "./PublicToiletsMarker";
import PublicShowerMarker from "./PublicShowerMarker";
import BicycleRepairStationMarker from "./BicycleRepairStationMarker";
import PublicBathMarker from "./PublicBathMarker";
import DeviceChargingStationMarker from "./DeviceChargingStationMarker";
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
);

export type OpenStreetMapNode = {
  id: number;
  lat: number;
  lon: number;
  tags: AmenityTags;
};

const amenitiesMap: { [k in Amenity]: Amenity } = {
  drinking_water: "drinking_water",
  shower: "shower",
  toilets: "toilets",
  public_bath: "public_bath",
  bicycle_repair_station: "bicycle_repair_station",
  device_charging_station: "device_charging_station"
};

export const amenities = Object.values(amenitiesMap);

export type Amenity = AmenityTags["amenity"];

export type Options = {
  around: number;
  lat: number;
  lng: number;
};

export const updateCachedItems = async (newNodes: OpenStreetMapNode[]) => {
  const cachedItems =
    (await localforage.getItem<OpenStreetMapNode[]>("amenities")) || [];

  const nodes = uniqBy(newNodes.concat(cachedItems), i => i.id);

  // fire&forget
  localforage.setItem("amenities", nodes);
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

let currentEndpointIndex = 0;

const fetchWithRetry = async (
  query: string,
  signal?: AbortSignal
): Promise<Response> => {
  const totalAttempts = OVERPASS_ENDPOINTS.length;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const endpoint =
      OVERPASS_ENDPOINTS[
        (currentEndpointIndex + attempt) % OVERPASS_ENDPOINTS.length
      ];

    try {
      const res = await fetch(`${endpoint}?data=${query}&output`, { signal });

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

export default async (options: Options): Promise<OpenStreetMapNode[]> => {
  if (currentRequest) {
    currentRequest.abort();
  }

  const controller = new AbortController();
  currentRequest = controller;

  const query = `
    [out:json];
    (nwr["amenity"~"${amenities.join("|")}"](around:${
    options.around
  },${options.lat},${options.lng}););
    out;>;out;
  `;

  try {
    const res = await fetchWithRetry(query, controller.signal);

    const json: { elements: OpenStreetMapNode[] } = await res.json();

    updateCachedItems(json.elements);

    return json.elements.filter(v => v.tags);
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
  }
};

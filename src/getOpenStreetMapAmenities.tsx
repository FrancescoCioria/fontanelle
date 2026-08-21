import * as localforage from "localforage";
import uniqBy from "lodash/uniqBy";
import distance from "@turf/distance";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import PublicToiletsMarker from "./PublicToiletsMarker";
import PublicShowerMarker from "./PublicShowerMarker";
import BicycleRepairStationMarker from "./BicycleRepairStationMarker";
import PublicBathMarker from "./PublicBathMarker";
import DeviceChargingStationMarker from "./DeviceChargingStationMarker";
import PlaygroundMarker from "./PlaygroundMarker";
import PicnicMarker from "./PicnicMarker";
import ElevatorMarker from "./ElevatorMarker";
import OpeningHours from "opening_hours";
import {
  Amenity,
  AmenityTags,
  OpenStreetMapNode,
  nodeKey
} from "../shared/amenities";

import "localforage-getitems";

// The vocabulary and the Overpass↔app normalization live in `shared/` because
// the server parses with the very same code — see shared/amenities.ts.
export {
  amenities,
  editableAmenities,
  isEditable,
  nodeKey,
  normalizeElement,
  RADIUS_MARGIN
} from "../shared/amenities";
export type {
  Amenity,
  AmenityTags,
  OpenStreetMapNode,
  OverpassElement
} from "../shared/amenities";

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

/**
 * Amenities where several objects a few metres apart are really one place.
 * Per-amenity on purpose: OSM often maps a playground as both an area and a
 * node inside it, and a park may carry one node per slide — but two fountains
 * 20m apart genuinely are two fountains.
 */
const MERGE_RADIUS_METERS: { [k in Amenity]?: number } = {
  playground: 50,
  // 164 of 195 picnic objects around Milan have a neighbour within 20m — they
  // are rows of tables in one area. Merging takes 195 pins down to ~71 places.
  // The 10m→30m curve is flat, so 20m catches "same spot" without chaining
  // across a whole park.
  picnic: 20
};

/** The richest object wins: an area outranks a node, then most tags, then id. */
const pickRepresentative = (group: OpenStreetMapNode[]): OpenStreetMapNode => {
  const isArea = (n: OpenStreetMapNode) =>
    (n.elementType || "node") === "node" ? 0 : 1;

  return [...group].sort(
    (a, b) =>
      isArea(b) - isArea(a) ||
      Object.keys(b.tags).length - Object.keys(a.tags).length ||
      a.id - b.id
  )[0];
};

/**
 * Collapses each cluster of near-duplicate objects into its representative,
 * moved to the group's midpoint. Single-linkage, so a row of swings spanning
 * one park collapses into one marker rather than a chain of them.
 */
export const mergeNearbyNodes = (
  nodes: OpenStreetMapNode[]
): OpenStreetMapNode[] => {
  const result: OpenStreetMapNode[] = [];
  const mergeable: { [k: string]: OpenStreetMapNode[] } = Object.create(null);

  nodes.forEach(node => {
    const amenity = node.tags.amenity;

    if (MERGE_RADIUS_METERS[amenity]) {
      mergeable[amenity] = (mergeable[amenity] || []).concat(node);
    } else {
      result.push(node);
    }
  });

  Object.keys(mergeable).forEach(amenity => {
    const group = mergeable[amenity];
    const radius = MERGE_RADIUS_METERS[amenity as Amenity]!;
    const taken = new Set<number>();

    group.forEach((node, i) => {
      if (taken.has(i)) return;

      taken.add(i);
      const members = [i];

      // walk the chain: anything near an already-collected member joins too
      for (let k = 0; k < members.length; k++) {
        const from = group[members[k]];

        group.forEach((other, j) => {
          if (taken.has(j)) return;

          const meters = distance([from.lon, from.lat], [other.lon, other.lat], {
            units: "meters"
          });

          if (meters <= radius) {
            taken.add(j);
            members.push(j);
          }
        });
      }

      if (members.length === 1) {
        result.push(node);
        return;
      }

      const nodes = members.map(idx => group[idx]);

      result.push({
        ...pickRepresentative(nodes),
        lat: nodes.reduce((s, n) => s + n.lat, 0) / nodes.length,
        lon: nodes.reduce((s, n) => s + n.lon, 0) / nodes.length
      });
    });
  });

  return result;
};

export const updateCachedItems = async (newNodes: OpenStreetMapNode[]) => {
  const cachedItems =
    (await localforage.getItem<OpenStreetMapNode[]>(CACHE_KEY)) || [];

  const nodes = uniqBy(newNodes.concat(cachedItems), nodeKey);

  // fire&forget
  localforage.setItem(CACHE_KEY, nodes);
};

let currentRequest: AbortController | null = null;

/**
 * ⚠️ `tiles` is not diagnostics — it is the only way the UI can tell "there is
 * genuinely nothing here" from "OpenStreetMap is down". The server answers 200
 * with whatever it has either way, which is right for the map and useless for
 * the user unless these counts are read.
 */
export type AmenitiesTiles = {
  requested: number;
  /** Tiles we currently cannot get: just failed, or cooling down after failing. */
  unreachable: number;
  /** Someone is fetching them right now. */
  held: number;
  inFlight: number;
  deferred: number;
};

export type AmenitiesResponse = {
  nodes: OpenStreetMapNode[];
  /** Some tiles didn't refresh in time. Ask again shortly; nothing is lost. */
  partial: boolean;
  tiles: AmenitiesTiles;
};

/**
 * Asks our own server, never Overpass.
 *
 * Everything hard — endpoint failover, retries, rate limits, concurrency, the
 * shared cache — happens server-side (`functions/api/amenities.ts`). The public
 * Overpass instances are too slow and too often down to be a browser's problem:
 * on 2026-07-26 all four answered a Paris query with a 504 or 17s, which from
 * here is just an empty map. The local IndexedDB copy stays, but as an offline
 * convenience, not as the thing that makes the app work.
 */
export default async (options: Options): Promise<AmenitiesResponse> => {
  if (currentRequest) {
    currentRequest.abort();
  }

  const controller = new AbortController();
  currentRequest = controller;

  const params = new URLSearchParams({
    lat: String(options.lat),
    lon: String(options.lng),
    radius: String(options.around)
  });

  try {
    const res = await fetch(`/api/amenities?${params}`, {
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`amenities API error: ${res.status} ${res.statusText}`);
    }

    const json: AmenitiesResponse = await res.json();
    const nodes = json.nodes || [];

    updateCachedItems(nodes);

    return {
      nodes,
      partial: !!json.partial,
      tiles: json.tiles || {
        requested: 0,
        unreachable: 0,
        held: 0,
        inFlight: 0,
        deferred: 0
      }
    };
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

  return closed() || notPublic() || "white";
};

/**
 * Whether this amenity charges — drawn as a coin badge (`FeeBadge`), never as
 * a colour.
 *
 * ⚠️ It used to return "gold" out of `getAmenityColor`, which made the fill
 * carry three meanings at once and could only ever show one of them: a paid
 * *and* closed toilet came out grey, with the price silently dropped. The two
 * are independent facts, so they get independent channels.
 */
export const hasFee = (amenityTags: AmenityTags): boolean =>
  "fee" in amenityTags &&
  typeof amenityTags.fee === "string" &&
  amenityTags.fee !== "no";

export const getAmenityIcon = (amenity: Amenity, size: number): JSX.Element =>
  getAmenityMarker({ amenity } as AmenityTags, size);

export const getAmenityMarker = (
  amenityTags: AmenityTags,
  size: number
): JSX.Element => {
  const color = getAmenityColor(amenityTags);
  const fee = hasFee(amenityTags);

  switch (amenityTags.amenity) {
    case "drinking_water":
      return <DrinkingWaterMarker size={size} />;
    case "toilets":
      return (
        <PublicToiletsMarker
          size={size}
          color={color}
          fee={fee}
          changingTable={amenityTags.changing_table === "yes"}
        />
      );
    case "shower":
      return <PublicShowerMarker size={size} color={color} fee={fee} />;
    case "bicycle_repair_station":
      return <BicycleRepairStationMarker size={size} />;
    case "public_bath":
      return <PublicBathMarker size={size} color={color} fee={fee} />;
    case "device_charging_station":
      return <DeviceChargingStationMarker size={size} />;
    case "playground":
      return <PlaygroundMarker size={size} color={color} fee={fee} />;
    case "picnic":
      return <PicnicMarker size={size} color={color} fee={fee} />;
    case "elevator":
      return <ElevatorMarker size={size} color={color} fee={fee} />;
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
    case "picnic":
      return "Picnic Area";
    case "elevator":
      return "Elevator";
  }
};

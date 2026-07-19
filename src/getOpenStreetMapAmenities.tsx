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
  // `leisure=picnic_table` (one table) and `tourism=picnic_site` (the area
  // around them), normalized together — see `PSEUDO_AMENITIES`
  | {
      amenity: "picnic";
      name?: string;
      access?: "yes" | "public" | "permissive" | "unknown" | "private";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
      opening_hours?: string;
      covered?: "yes" | "no";
      backrest?: "yes" | "no";
      wheelchair?: "yes" | "no" | "unknown" | "limited";
      indoor?: "yes" | "no";
    }
);

/**
 * Amenities OSM files under a key other than `amenity`. One table drives both
 * the Overpass query and the parsing, so the two can't drift apart.
 * ⚠️ Must be declared before `editableAmenities`, which reads it at module load.
 */
const PSEUDO_AMENITIES: {
  key: string;
  value: string;
  amenity: Amenity;
}[] = [
  { key: "leisure", value: "playground", amenity: "playground" },
  // a picnic site is the area, a picnic table the furniture in it — the same
  // place to someone looking for somewhere to eat outdoors
  { key: "leisure", value: "picnic_table", amenity: "picnic" },
  { key: "tourism", value: "picnic_site", amenity: "picnic" }
];

const PSEUDO_AMENITY_NAMES: Amenity[] = PSEUDO_AMENITIES.map(p => p.amenity);

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
 * Pseudo-amenities are read-only: they live under a key other than `amenity`
 * (`leisure`, `tourism`), which the OSM write path (`osm.ts`) can't serialize
 * back — it would write `amenity=playground`, which means nothing in OSM.
 */
const isEditableAmenity = (amenity: Amenity) =>
  !PSEUDO_AMENITY_NAMES.includes(amenity);

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
  playground: "playground",
  picnic: "picnic"
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

const isKnownAmenity = (value?: string): value is Amenity =>
  !!value && (amenities as string[]).includes(value);

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

  // An `amenity` we support always wins; the pseudo key is the fallback.
  // ⚠️ NOT `!element.tags.amenity`: a playground can carry an unrelated amenity
  // (real case, way/583656299: `leisure=playground` + `amenity=traffic_park`),
  // and keeping the foreign value makes it vanish downstream — and get cached
  // that way. Conversely an `amenity=toilets` that also has a picnic table
  // stays a toilet.
  const pseudo = isKnownAmenity(element.tags.amenity)
    ? undefined
    : PSEUDO_AMENITIES.find(p => element.tags![p.key] === p.value);

  // ⚠️ Rewrite ONLY the key that actually matched. Tags dropped here are also
  // dropped on save (osmUpdateNode replaces the whole tag set), so stripping
  // `leisure` unconditionally would delete e.g. `leisure=sauna` from an
  // `amenity=public_bath` node the user merely edits the fee of.
  let tags = element.tags as AmenityTags;

  if (pseudo) {
    const { [pseudo.key]: _matched, ...rest } = element.tags;
    tags = { ...rest, amenity: pseudo.amenity } as AmenityTags;
  }

  // never cache something we can't render: it would sit in IndexedDB forever
  if (!isKnownAmenity(tags.amenity)) return null;

  return { id: element.id, lat, lon, elementType: element.type, tags };
};

export default async (options: Options): Promise<OpenStreetMapNode[]> => {
  if (currentRequest) {
    currentRequest.abort();
  }

  const controller = new AbortController();
  currentRequest = controller;

  const around = `(around:${options.around},${options.lat},${options.lng})`;

  const osmAmenities = amenities.filter(
    a => !PSEUDO_AMENITY_NAMES.includes(a)
  );

  // one branch per non-`amenity` key, values anchored so `picnic_table` can't
  // also match e.g. `picnic_table_covered`
  const pseudoBranches = [...new Set(PSEUDO_AMENITIES.map(p => p.key))].map(
    key =>
      `nwr["${key}"~"^(${PSEUDO_AMENITIES.filter(p => p.key === key)
        .map(p => p.value)
        .join("|")})$"]${around};`
  );

  // `out center` gives areas (most playgrounds are ways/relations) a single
  // representative point instead of their full geometry
  const query = `
    [out:json];
    (
      nwr["amenity"~"^(${osmAmenities.join("|")})$"]${around};
      ${pseudoBranches.join("\n      ")}
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
      return (
        <PublicToiletsMarker
          size={size}
          color={color}
          changingTable={amenityTags.changing_table === "yes"}
        />
      );
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
    case "picnic":
      return <PicnicMarker size={size} color={color} />;
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
  }
};

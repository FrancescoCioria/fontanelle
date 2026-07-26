/**
 * Amenity vocabulary and Overpass→app normalization.
 *
 * ⚠️ Imported by BOTH the browser bundle (`src/`) and the Cloudflare Pages
 * Functions (`functions/`), so it must stay free of React, localforage, DOM and
 * Node APIs. The two sides deriving the Overpass query and the parsing from the
 * same tables is the whole point: a server that fetched a tag the client can't
 * render would cache it in D1 forever.
 */

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

export type Amenity = AmenityTags["amenity"];

/**
 * Amenities OSM files under a key other than `amenity`. One table drives both
 * the Overpass query and the parsing, so the two can't drift apart.
 * ⚠️ Must be declared before `editableAmenities`, which reads it at module load.
 */
export const PSEUDO_AMENITIES: {
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

const PSEUDO_AMENITY_NAMES: Amenity[] = PSEUDO_AMENITIES.map(
  p => p.amenity
);

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

/**
 * Pseudo-amenities are read-only: they live under a key other than `amenity`
 * (`leisure`, `tourism`), which the OSM write path (`osm.ts`) can't serialize
 * back — it would write `amenity=playground`, which means nothing in OSM.
 */
const isEditableAmenity = (amenity: Amenity) =>
  !PSEUDO_AMENITY_NAMES.includes(amenity);

/** Amenities the user can add from the app. */
export const editableAmenities = amenities.filter(isEditableAmenity);

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

/** Only plain nodes we know how to tag back can be created/edited/deleted. */
export const isEditable = (node: OpenStreetMapNode): boolean =>
  (node.elementType || "node") === "node" &&
  isEditableAmenity(node.tags.amenity);

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

  // never cache something we can't render: it would sit in the caches forever
  if (!isKnownAmenity(tags.amenity)) return null;

  return { id: element.id, lat, lon, elementType: element.type, tags };
};

/**
 * The Overpass query for one bounding box. `out center` gives areas (most
 * playgrounds are ways/relations) a single representative point instead of
 * their full geometry.
 */
export const overpassQuery = (bbox: {
  south: number;
  west: number;
  north: number;
  east: number;
}): string => {
  const area = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;

  const osmAmenities = amenities.filter(
    a => !PSEUDO_AMENITY_NAMES.includes(a)
  );

  // one branch per non-`amenity` key, values anchored so `picnic_table` can't
  // also match e.g. `picnic_table_covered`
  const pseudoBranches = [...new Set(PSEUDO_AMENITIES.map(p => p.key))].map(
    key =>
      `nwr["${key}"~"^(${PSEUDO_AMENITIES.filter(p => p.key === key)
        .map(p => p.value)
        .join("|")})$"]${area};`
  );

  // ⚠️ `[timeout:*]` is not decoration: without it Overpass applies its own
  // default and a slow instance sits in the queue past our fetch deadline.
  return `[out:json][timeout:60];
(
  nwr["amenity"~"^(${osmAmenities.join("|")})$"]${area};
  ${pseudoBranches.join("\n  ")}
);
out center;`;
};

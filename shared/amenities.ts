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
  // OSM tags lifts as `highway=elevator`, not `amenity=*` — another
  // pseudo-amenity, see `PSEUDO_AMENITIES`
  | {
      amenity: "elevator";
      name?: string;
      ref?: string;
      operator?: string;
      access?: "yes" | "public" | "permissive" | "unknown" | "private";
      wheelchair?: "yes" | "no" | "unknown" | "limited";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
      opening_hours?: string;
      // the floors it serves, e.g. `0;-1`. Free text: OSM writes lists
      // (`-3;-2;-1;0`), so don't narrow it to a number
      level?: string;
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
  /**
   * The app may create and edit this one. ⚠️ Only ever set where the amenity
   * maps to a *single* key/value pair: writing back is the inverse of the
   * folding done in `normalizeElement`, and an amenity with two spellings has
   * no inverse — see `picnic` below.
   */
  writable?: boolean;
}[] = [
  // 44% of Italian playgrounds are plain nodes (Overpass, 2026-08-10: 10,457
  // nodes against 13,343 ways), so a node is an ordinary way to map one, not a
  // second-class shape. Areas stay read-only: `isEditable` gates on the element
  // type, not on this flag.
  {
    key: "leisure",
    value: "playground",
    amenity: "playground",
    writable: true
  },
  // a picnic site is the area, a picnic table the furniture in it — the same
  // place to someone looking for somewhere to eat outdoors.
  // ⚠️ Precisely because two tags fold into one amenity, this one cannot be
  // written back: nothing in `amenity: "picnic"` says which of the two the user
  // meant. Making it writable means asking them, not guessing here.
  { key: "leisure", value: "picnic_table", amenity: "picnic" },
  { key: "tourism", value: "picnic_site", amenity: "picnic" },
  // ⚠️ 86% of lifts are plain nodes (taginfo, 2026-08-09: 48.8k of 56.9k), so
  // this one is read-only by *policy*, not by shape — flipping `writable` is
  // all it would take now that the write path serializes the real pair.
  { key: "highway", value: "elevator", amenity: "elevator" }
];

/**
 * The OSM key/value an app amenity is actually stored under, or undefined when
 * it is a plain `amenity=*` (or a pseudo-amenity we refuse to write).
 *
 * ⚠️ The inverse of the folding in `normalizeElement`, and the reason the write
 * path can touch a playground at all: `amenity=playground` means nothing to
 * anybody in OSM, `leisure=playground` is the tag.
 */
export const osmTagFor = (
  amenity: Amenity
): { key: string; value: string } | undefined => {
  const writable = PSEUDO_AMENITIES.filter(
    p => p.amenity === amenity && p.writable
  );

  // two spellings, no inverse — refuse rather than pick one
  return writable.length === 1 ? writable[0] : undefined;
};

/**
 * App tag set → the tags OSM stores. ⚠️ Every write goes through this: the rest
 * of the app discriminates on one `amenity` field, and that field is a fiction
 * for anything in `PSEUDO_AMENITIES`.
 */
export const toOsmTags = (tags: {
  [k: string]: string;
}): { [k: string]: string } => {
  const pseudo = osmTagFor(tags.amenity as Amenity);

  if (!pseudo) return { ...tags };

  const { amenity: _fictional, ...rest } = tags;

  return { ...rest, [pseudo.key]: pseudo.value };
};

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
  picnic: "picnic",
  elevator: "elevator"
};

export const amenities = Object.values(amenitiesMap);

/**
 * A pseudo-amenity is writable only when it declares the one key/value pair the
 * write path should serialize. Without that the app would write
 * `amenity=playground` — a tag that means nothing to anybody in OSM.
 */
const isEditableAmenity = (amenity: Amenity) =>
  !PSEUDO_AMENITY_NAMES.includes(amenity) || !!osmTagFor(amenity);

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

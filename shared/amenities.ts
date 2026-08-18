/**
 * Amenity vocabulary and Overpass→app normalization.
 *
 * ⚠️ Imported by BOTH the browser bundle (`src/`) and the Cloudflare Pages
 * Functions (`functions/`), so it must stay free of React, localforage, DOM and
 * Node APIs. The two sides deriving the Overpass query and the parsing from the
 * same tables is the whole point: a server that fetched a tag the client can't
 * render would cache it in D1 forever.
 */

/**
 * How far past the searched radius a point may sit and still be shown — a hair
 * of slack on the edge of the circle, nothing more.
 *
 * ⚠️ Lives here because the server (deciding what to answer) and the browser
 * (deciding what to draw out of its offline copy) must use the same number:
 * two edges a few metres apart make points blink in and out on a pan.
 *
 * ⚠️ For one day (2026-08-10 → 08-11) the app instead showed everything inside
 * the map's *viewport*, so the radius said "how far to fetch" and the screen
 * said "how much to show". It fixed a real thing — the basemap draws its own
 * fountain and toilet symbols across the whole screen, and ours stopped at the
 * disc — but "the screen" has no upper bound: zoomed out over Bilbao it meant
 * 5.942 points up to 167 km away, 817 KB, drawn from whatever anyone had ever
 * searched. A map that claims a coverage it doesn't have is worse than one that
 * admits it only looked where you asked. If the basemap symbols become a
 * nuisance again, that gets solved for what it is — not by quietly widening the
 * circle the user set. (Done on 2026-08-18: `hideBasemapDuplicates` in
 * `Map.tsx` drops the basemap's own icons for the categories we draw.)
 */
export const RADIUS_MARGIN = 1.05;

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
  // A picnic site is the area, a picnic table the furniture in it — the same
  // place to someone looking for somewhere to eat outdoors, two different
  // objects to OSM. ⚠️ Only the table is writable, and that is a deliberate
  // narrowing, not a default: someone dropping a pin from a phone is standing
  // at a table, and an *area* drawn as a single point is a worse map than no
  // point at all. So new picnic objects are always tables.
  { key: "leisure", value: "picnic_table", amenity: "picnic", writable: true },
  // ⚠️ Read-only here does NOT mean an existing site can't be edited: which
  // spelling a node already carries is preserved on save (`tagsForOsm`), or
  // editing the fee of a picnic site would quietly demote it to a table.
  { key: "tourism", value: "picnic_site", amenity: "picnic" },
  // 86% of lifts are plain nodes (taginfo, 2026-08-09: 48.8k of 56.9k), and
  // `highway=elevator` is a single unambiguous pair, so there is nothing left
  // to decide — unlike picnic above.
  { key: "highway", value: "elevator", amenity: "elevator", writable: true }
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

/**
 * Other people's spellings for things this app already has an amenity for.
 *
 * ⚠️ Not the same idea as `PSEUDO_AMENITIES`, which is about an amenity whose
 * *only* OSM spelling lives under another key. These are alternatives: a
 * drinking fountain is normally `amenity=drinking_water`, but plenty of them
 * are an `amenity=fountain` you can drink from. The app was blind to all of
 * them, and visibly so — the Mapbox basemap draws its `drinking-water` symbol
 * on these, so the map showed an icon with no pin of ours under it. Measured in
 * Italy 2026-08-10: 1,146 drinkable `amenity=fountain`, 189 `fountain=drinking`
 * and 293 toilet blocks mapped only as `building=toilets`.
 *
 * ⚠️ **Conditional, hence a separate table**: `amenity=fountain` alone is a
 * monument, not a drink. Every pair in `when` must match.
 *
 * ⚠️ **Never written.** These say how somebody else spelled it, not how we
 * spell it — see `tagsForOsm`, which keeps an object's own spelling on save.
 * Writing ours would retag a monumental fountain as a tap.
 */
export const ALSO_TAGGED_AS: {
  when: { [k: string]: string };
  amenity: Amenity;
}[] = [
  { when: { amenity: "fountain", drinking_water: "yes" }, amenity: "drinking_water" },
  { when: { fountain: "drinking" }, amenity: "drinking_water" },
  { when: { building: "toilets" }, amenity: "toilets" }
];

/**
 * How a set of OSM tags spells one of our amenities, or null for something we
 * don't render. ⚠️ One function, used both when reading Overpass and when
 * deciding what to write back, so the two can't disagree about what an object
 * already is.
 */
export type Spelling =
  | { kind: "amenity"; amenity: Amenity }
  | { kind: "pseudo"; amenity: Amenity; key: string; value: string }
  | { kind: "alias"; amenity: Amenity; when: { [k: string]: string } };

export const readSpelling = (tags: {
  [k: string]: string;
}): Spelling | null => {
  // ⚠️ A supported `amenity` wins. Don't gate this on `!tags.amenity`:
  // `way/583656299` is `leisure=playground` + `amenity=traffic_park`, and
  // keeping the foreign value makes it vanish downstream *and* get cached.
  if (isKnownAmenity(tags.amenity)) {
    return { kind: "amenity", amenity: tags.amenity };
  }

  const pseudo = PSEUDO_AMENITIES.find(p => tags[p.key] === p.value);

  if (pseudo) {
    return {
      kind: "pseudo",
      amenity: pseudo.amenity,
      key: pseudo.key,
      value: pseudo.value
    };
  }

  const alias = ALSO_TAGGED_AS.find(a =>
    Object.keys(a.when).every(k => tags[k] === a.when[k])
  );

  return alias ? { kind: "alias", amenity: alias.amenity, when: alias.when } : null;
};

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

  const spelling = readSpelling(element.tags);

  // never cache something we can't render: it would sit in the caches forever
  if (!spelling) return null;

  // ⚠️ Rewrite ONLY what has to change. Tags dropped here are also dropped on
  // save (the write path replaces the whole tag set), so stripping `leisure`
  // unconditionally would delete e.g. `leisure=sauna` from an
  // `amenity=public_bath` node the user merely edits the fee of.
  let tags = element.tags as AmenityTags;

  if (spelling.kind === "pseudo") {
    const { [spelling.key]: _matched, ...rest } = element.tags;
    tags = { ...rest, amenity: spelling.amenity } as AmenityTags;
  }

  if (spelling.kind === "alias") {
    // ⚠️ This one *does* lose a tag — `amenity=fountain` becomes
    // `amenity=drinking_water` in our model, because the rest of the app
    // discriminates on that single field. The original is restored on save
    // from what OSM still holds (`tagsForOsm`); losing it there would retype a
    // monument as a tap. The condition tags (`drinking_water=yes`,
    // `fountain=drinking`, `building=toilets`) are kept, so the object stays
    // recognisable as itself.
    tags = { ...element.tags, amenity: spelling.amenity } as AmenityTags;
  }

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

  // ⚠️ One branch per alias, with *all* its conditions: `amenity=fountain`
  // on its own is a monument, and asking for it would flood the map with
  // ornamental basins nobody can drink from.
  const aliasBranches = ALSO_TAGGED_AS.map(
    a =>
      `nwr${Object.keys(a.when)
        .map(k => `["${k}"="${a.when[k]}"]`)
        .join("")}${area};`
  );

  // ⚠️ `[timeout:*]` is not decoration: without it Overpass applies its own
  // default and a slow instance sits in the queue past our fetch deadline.
  return `[out:json][timeout:60];
(
  nwr["amenity"~"^(${osmAmenities.join("|")})$"]${area};
  ${pseudoBranches.join("\n  ")}
  ${aliasBranches.join("\n  ")}
);
out center;`;
};

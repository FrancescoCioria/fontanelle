/**
 * The searchable catalogue: everything the app can look up **once**, on demand,
 * without carrying it on the map forever.
 *
 * ⚠️ This is a different kind of thing from `amenities.ts`, and the difference
 * is the whole design. An amenity in that file is *kept*: it rides in the tile
 * query, it is cached in D1 for 30 days and mirrored into IndexedDB for offline,
 * it has a pill, a sprite, a form and a write path. That machinery is worth it
 * for the handful of things you want to see whenever you open the map — and
 * absurd for a parking meter, which you need three times a year and always at a
 * known spot. A preset here costs one line and buys a live lookup around the
 * point you are looking at.
 *
 * ⚠️ Consequences of *not* being in the tile cache, all deliberate:
 *  - results are always fresh (no 30-day TTL), and always cost an Overpass
 *    round trip — there is nothing to serve them from;
 *  - they are not stored, so they are gone when you leave search mode, and
 *    searching offline says so instead of showing a stale answer;
 *  - they are read-only. The write path serializes a *known* tag pair per
 *    amenity (`toOsmTags`); a generic catalogue has no forms and no inverse, so
 *    there is no Edit button on a result.
 *
 * ⚠️ Imported by BOTH the browser and the Pages Function — no React, no DOM,
 * no Node. The Function builds the Overpass query from **its own** copy of this
 * table, keyed by `id`: the client sends an id, never tags. That is what keeps
 * a public Overpass instance from becoming an open query endpoint.
 */

import { OverpassElement } from "./amenities";

export type SearchPreset = {
  /** Stable: it travels in the URL and in nothing else. Renaming it is a break. */
  id: string;
  label: string;
  /** Heading in the picker. Purely presentational. */
  group: string;
  /**
   * The OSM tags an object must carry — **all** of them. More than one pair is
   * not an edge case: a parking meter is `amenity=vending_machine` +
   * `vending=parking_tickets` (106,341 of them worldwide), while
   * `amenity=parking_meter` is a dead tag with 2 objects on Earth (taginfo,
   * 2026-08-21). A table that could only hold one pair would have made the very
   * thing this feature was built for unmappable.
   */
  tags: { [k: string]: string };
  /** Extra words the picker's filter matches, for what OSM calls it something else. */
  keywords?: string[];
};

/**
 * Hard ceiling on one search. ⚠️ Read together with `tooMany` below: this is
 * not a "show the first N" cap, because Overpass returns objects in its own
 * order (by id), which is spatially arbitrary. Drawing 2,000 of 9,000 benches
 * would put pins across the whole disc while omitting the one on this corner —
 * a map claiming a coverage it doesn't have, which is the failure mode this
 * codebase keeps coming back to (see RADIUS_MARGIN). So past this we draw
 * *nothing* and say to narrow the radius.
 *
 * Density measured 2026-08-21 within 1km of central Milan: 26 parking meters,
 * 385 benches. Two orders of magnitude apart, in the same circle.
 */
export const MAX_SEARCH_RESULTS = 2000;

export const SEARCH_PRESETS: SearchPreset[] = [
  // --- Money ---
  { id: "atm", label: "ATM", group: "Money", tags: { amenity: "atm" }, keywords: ["cash", "bancomat"] },
  { id: "bank", label: "Bank", group: "Money", tags: { amenity: "bank" } },
  { id: "bureau_de_change", label: "Currency exchange", group: "Money", tags: { amenity: "bureau_de_change" }, keywords: ["change", "money"] },
  { id: "post_box", label: "Post box", group: "Money", tags: { amenity: "post_box" }, keywords: ["mail", "letter"] },
  { id: "post_office", label: "Post office", group: "Money", tags: { amenity: "post_office" }, keywords: ["mail", "parcel"] },
  { id: "parcel_locker", label: "Parcel locker", group: "Money", tags: { amenity: "parcel_locker" }, keywords: ["amazon", "pickup", "package"] },

  // --- Health ---
  { id: "pharmacy", label: "Pharmacy", group: "Health", tags: { amenity: "pharmacy" }, keywords: ["chemist", "farmacia"] },
  { id: "hospital", label: "Hospital", group: "Health", tags: { amenity: "hospital" }, keywords: ["emergency", "a&e"] },
  { id: "clinic", label: "Clinic", group: "Health", tags: { amenity: "clinic" } },
  { id: "doctors", label: "Doctor", group: "Health", tags: { amenity: "doctors" }, keywords: ["gp"] },
  { id: "dentist", label: "Dentist", group: "Health", tags: { amenity: "dentist" } },
  { id: "veterinary", label: "Vet", group: "Health", tags: { amenity: "veterinary" }, keywords: ["animal", "dog", "cat"] },
  { id: "defibrillator", label: "Defibrillator", group: "Health", tags: { emergency: "defibrillator" }, keywords: ["aed", "heart", "emergency"] },

  // --- Getting around ---
  { id: "parking", label: "Car park", group: "Getting around", tags: { amenity: "parking" }, keywords: ["parking", "car"] },
  { id: "parking_entrance", label: "Car park entrance", group: "Getting around", tags: { amenity: "parking_entrance" } },
  // ⚠️ Two tags, and the reason this table takes a set rather than a pair.
  { id: "parking_meter", label: "Parking meter", group: "Getting around", tags: { amenity: "vending_machine", vending: "parking_tickets" }, keywords: ["parcometro", "ticket", "pay", "parking"] },
  { id: "bicycle_parking", label: "Bicycle parking", group: "Getting around", tags: { amenity: "bicycle_parking" }, keywords: ["bike", "rack"] },
  { id: "bicycle_rental", label: "Bike sharing", group: "Getting around", tags: { amenity: "bicycle_rental" }, keywords: ["bike", "rental"] },
  { id: "motorcycle_parking", label: "Motorcycle parking", group: "Getting around", tags: { amenity: "motorcycle_parking" }, keywords: ["moto", "scooter"] },
  { id: "fuel", label: "Petrol station", group: "Getting around", tags: { amenity: "fuel" }, keywords: ["gas", "diesel", "benzina"] },
  { id: "charging_station", label: "EV charging", group: "Getting around", tags: { amenity: "charging_station" }, keywords: ["electric", "car", "colonnina"] },
  { id: "car_wash", label: "Car wash", group: "Getting around", tags: { amenity: "car_wash" } },
  { id: "car_rental", label: "Car rental", group: "Getting around", tags: { amenity: "car_rental" } },
  { id: "car_sharing", label: "Car sharing", group: "Getting around", tags: { amenity: "car_sharing" } },
  { id: "taxi", label: "Taxi rank", group: "Getting around", tags: { amenity: "taxi" } },
  { id: "bus_station", label: "Bus station", group: "Getting around", tags: { amenity: "bus_station" }, keywords: ["coach"] },
  { id: "ferry_terminal", label: "Ferry terminal", group: "Getting around", tags: { amenity: "ferry_terminal" }, keywords: ["boat"] },
  { id: "compressed_air", label: "Air pump", group: "Getting around", tags: { amenity: "compressed_air" }, keywords: ["tyre", "tire", "inflate"] },

  // --- Food & drink ---
  { id: "restaurant", label: "Restaurant", group: "Food & drink", tags: { amenity: "restaurant" } },
  { id: "fast_food", label: "Fast food", group: "Food & drink", tags: { amenity: "fast_food" }, keywords: ["takeaway", "burger", "kebab"] },
  { id: "cafe", label: "Café", group: "Food & drink", tags: { amenity: "cafe" }, keywords: ["coffee", "bar"] },
  { id: "bar", label: "Bar", group: "Food & drink", tags: { amenity: "bar" }, keywords: ["drinks"] },
  { id: "pub", label: "Pub", group: "Food & drink", tags: { amenity: "pub" }, keywords: ["beer"] },
  { id: "ice_cream", label: "Ice cream", group: "Food & drink", tags: { amenity: "ice_cream" }, keywords: ["gelato"] },
  { id: "biergarten", label: "Beer garden", group: "Food & drink", tags: { amenity: "biergarten" } },
  { id: "marketplace", label: "Market", group: "Food & drink", tags: { amenity: "marketplace" }, keywords: ["mercato", "stall"] },
  { id: "bbq", label: "Barbecue", group: "Food & drink", tags: { amenity: "bbq" }, keywords: ["grill", "griglia"] },

  // --- Shops ---
  { id: "supermarket", label: "Supermarket", group: "Shops", tags: { shop: "supermarket" }, keywords: ["grocery", "food"] },
  { id: "convenience", label: "Convenience store", group: "Shops", tags: { shop: "convenience" }, keywords: ["alimentari", "grocery"] },
  { id: "bakery", label: "Bakery", group: "Shops", tags: { shop: "bakery" }, keywords: ["bread", "panificio"] },
  { id: "butcher", label: "Butcher", group: "Shops", tags: { shop: "butcher" }, keywords: ["meat", "macelleria"] },
  { id: "kiosk", label: "Kiosk", group: "Shops", tags: { shop: "kiosk" }, keywords: ["newspaper", "edicola", "tobacco"] },
  { id: "hairdresser", label: "Hairdresser", group: "Shops", tags: { shop: "hairdresser" }, keywords: ["barber", "parrucchiere"] },
  { id: "laundry", label: "Laundrette", group: "Shops", tags: { shop: "laundry" }, keywords: ["washing", "lavanderia"] },
  { id: "doityourself", label: "DIY store", group: "Shops", tags: { shop: "doityourself" }, keywords: ["hardware", "ferramenta"] },

  // --- Street furniture ---
  { id: "bench", label: "Bench", group: "Street furniture", tags: { amenity: "bench" }, keywords: ["sit", "panchina", "rest"] },
  { id: "shelter", label: "Shelter", group: "Street furniture", tags: { amenity: "shelter" }, keywords: ["rain", "bus stop"] },
  { id: "waste_basket", label: "Waste basket", group: "Street furniture", tags: { amenity: "waste_basket" }, keywords: ["bin", "rubbish", "trash", "cestino"] },
  { id: "recycling", label: "Recycling", group: "Street furniture", tags: { amenity: "recycling" }, keywords: ["glass", "paper", "raccolta"] },
  { id: "public_bookcase", label: "Public bookcase", group: "Street furniture", tags: { amenity: "public_bookcase" }, keywords: ["books", "library"] },
  // ⚠️ Deliberately overlaps the map: a *drinkable* fountain is already drawn
  // as drinking water (`ALSO_TAGGED_AS`). This preset answers a different
  // question — "where is there a fountain" — and returns the monumental ones
  // the map has no pin for.
  { id: "fountain", label: "Fountain", group: "Street furniture", tags: { amenity: "fountain" }, keywords: ["water", "fontana"] },
  { id: "clock", label: "Public clock", group: "Street furniture", tags: { amenity: "clock" }, keywords: ["time", "orologio"] },
  { id: "lounger", label: "Sun lounger", group: "Street furniture", tags: { amenity: "lounger" }, keywords: ["deckchair", "sdraio"] },

  // --- Public services ---
  { id: "library", label: "Library", group: "Public services", tags: { amenity: "library" }, keywords: ["books", "biblioteca"] },
  { id: "townhall", label: "Town hall", group: "Public services", tags: { amenity: "townhall" }, keywords: ["comune", "municipio", "council"] },
  { id: "police", label: "Police", group: "Public services", tags: { amenity: "police" }, keywords: ["polizia", "carabinieri"] },
  { id: "fire_station", label: "Fire station", group: "Public services", tags: { amenity: "fire_station" }, keywords: ["pompieri", "vigili del fuoco"] },
  { id: "community_centre", label: "Community centre", group: "Public services", tags: { amenity: "community_centre" } },
  { id: "place_of_worship", label: "Place of worship", group: "Public services", tags: { amenity: "place_of_worship" }, keywords: ["church", "chiesa", "mosque", "temple"] },

  // --- Culture & leisure ---
  { id: "museum", label: "Museum", group: "Culture & leisure", tags: { tourism: "museum" }, keywords: ["museo", "gallery"] },
  { id: "viewpoint", label: "Viewpoint", group: "Culture & leisure", tags: { tourism: "viewpoint" }, keywords: ["panorama", "view", "belvedere"] },
  { id: "cinema", label: "Cinema", group: "Culture & leisure", tags: { amenity: "cinema" }, keywords: ["movie", "film"] },
  { id: "theatre", label: "Theatre", group: "Culture & leisure", tags: { amenity: "theatre" }, keywords: ["teatro"] },
  { id: "arts_centre", label: "Arts centre", group: "Culture & leisure", tags: { amenity: "arts_centre" } },
  { id: "nightclub", label: "Nightclub", group: "Culture & leisure", tags: { amenity: "nightclub" }, keywords: ["disco", "club"] },
  { id: "dog_park", label: "Dog park", group: "Culture & leisure", tags: { leisure: "dog_park" }, keywords: ["dog", "cane"] },
  { id: "fitness_station", label: "Outdoor gym", group: "Culture & leisure", tags: { leisure: "fitness_station" }, keywords: ["fitness", "workout", "calisthenics"] },

  // --- Kids ---
  { id: "kindergarten", label: "Kindergarten", group: "Kids", tags: { amenity: "kindergarten" }, keywords: ["nursery", "asilo"] },
  { id: "childcare", label: "Childcare", group: "Kids", tags: { amenity: "childcare" }, keywords: ["nido", "creche"] },
  { id: "school", label: "School", group: "Kids", tags: { amenity: "school" }, keywords: ["scuola"] }
];

export const findSearchPreset = (id: string): SearchPreset | undefined =>
  SEARCH_PRESETS.find(preset => preset.id === id);

/** One result. Plain OSM tags: no fold, no pseudo-amenity, no discriminant. */
export type SearchResultNode = {
  id: number;
  elementType: "node" | "way" | "relation";
  lat: number;
  lon: number;
  tags: { [k: string]: string };
};

/**
 * ⚠️ Built server-side from the server's own table, never from anything the
 * client sent: the request carries a preset **id**, and an id that isn't in the
 * table is a 400. The tag values below are string literals in this file, so
 * nothing user-written ever reaches the query.
 *
 * `out center` so an area (a car park, a museum) gets one representative point
 * like the amenity path does; the trailing count is Overpass's own limit —
 * verified 2026-08-21, `out center 50` returned exactly 50 of 385 benches. We
 * ask for one more than we will accept, so the answer itself tells us whether
 * the true set is bigger than the cap.
 */
export const searchQuery = (
  preset: SearchPreset,
  area: { lat: number; lon: number; radius: number }
): string => {
  const filters = Object.keys(preset.tags)
    .map(key => `["${key}"="${preset.tags[key]}"]`)
    .join("");

  return `[out:json][timeout:60];
nwr${filters}(around:${area.radius},${area.lat},${area.lon});
out center ${MAX_SEARCH_RESULTS + 1};`;
};

/**
 * Overpass element → result. Unlike `normalizeElement` this rewrites nothing:
 * a result is shown as OSM has it, because the app has no model to fold it into
 * and nothing here will ever be written back.
 */
export const normalizeSearchElement = (
  element: OverpassElement
): SearchResultNode | null => {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  if (lat === undefined || lon === undefined) return null;

  return {
    id: element.id,
    elementType: element.type,
    lat,
    lon,
    tags: element.tags || {}
  };
};

/**
 * A predicate for one search box's worth of text.
 *
 * ⚠️ A factory, not a `(subject, text)` call: the needle is normalized and
 * split **once** per keystroke instead of once per candidate, and the caller
 * gets something it can hand straight to `filter`.
 *
 * ⚠️ It takes the fields it reads, not a `SearchPreset`. The picker also
 * matches the amenities the map already carries, and faking a preset for each
 * of them meant inventing an `id`, a `group` and a `tags` pair that were wrong
 * for exactly the three amenities OSM files under another key.
 */
export const searchMatcher = (
  text: string
): ((subject: {
  label: string;
  group?: string;
  keywords?: string[];
  tags?: { [k: string]: string };
}) => boolean) => {
  // `parking_meter` has to be found by typing "parking meter"
  const words = text
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return () => true;

  return subject => {
    const haystack = [
      subject.label,
      subject.group || "",
      ...(subject.keywords || []),
      ...Object.keys(subject.tags || {}),
      ...Object.values(subject.tags || {})
    ]
      .join(" ")
      .toLowerCase()
      .replace(/_/g, " ");

    return words.every(word => haystack.includes(word));
  };
};

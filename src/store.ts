import { create } from "zustand";
import localforage from "localforage";
import { amenities } from "./getOpenStreetMapAmenities";
import type { OpenStreetMapNode, Amenity } from "./getOpenStreetMapAmenities";
import type { SearchPreset, SearchResultNode } from "./search";
import type { UpsertNode } from "./UpsertNode";

type Filters = { [k in Amenity]: boolean };

const FILTERS_KEY = "filters";

const filtersWhere = (on: (amenity: Amenity) => boolean): Filters =>
  Object.fromEntries(amenities.map(a => [a, on(a)])) as Filters;

const allFiltersOn = () => filtersWhere(() => true);

const onlyFilter = (amenity: Amenity) => filtersWhere(a => a === amenity);

/**
 * ⚠️ Saved filters are merged **over** the defaults, never used as-is: an
 * amenity added to the app after the user last saved is absent from the stored
 * object, and `undefined` reads as "off". It would be hidden on their map
 * forever, with no error and nothing to click — the pill is on, the markers
 * aren't. Unknown keys are dropped for the mirror-image reason.
 */
const hydrateFilters = (saved: unknown): Filters => {
  const filters = allFiltersOn();
  if (!saved || typeof saved !== "object") return filters;
  for (const amenity of amenities) {
    const value = (saved as Record<string, unknown>)[amenity];
    if (typeof value === "boolean") filters[amenity] = value;
  }
  return filters;
};

/**
 * Persistence lives here, not at the call sites, because two different actions
 * now change the filters (toggle and isolate) and they must not be able to
 * disagree about whether the result gets saved.
 */
const persist = (filters: Filters) => {
  localforage.setItem(FILTERS_KEY, filters);
  return filters;
};

export const loadFilters = () =>
  localforage.getItem(FILTERS_KEY).then(hydrateFilters);

/**
 * What the map can honestly say about the area currently on screen.
 * ⚠️ `empty` is a claim, not a shrug: only set when the server reports every
 * tile covering the area as fresh. Everything less certain gets its own kind.
 */
export type DataStatus =
  /**
   * Part of the area on screen has not been fetched yet. ⚠️ Shown even when
   * there are already markers, and that is the point: a tile the server hasn't
   * answered for yet is a slice of map with nothing on it, and next to a
   * neighbourhood full of pins it reads as "nothing here" rather than "not
   * loaded". The map cannot make that distinction visible; only this can.
   */
  | { kind: "incomplete"; retrying: boolean; hasData: boolean }
  | { kind: "unreachable"; retrying: boolean; hasData: boolean }
  | { kind: "offline" }
  | { kind: "empty" }
  | null;

/**
 * A run of the generic search — the map's other mode. ⚠️ Deliberately not
 * persisted and not cached: it is one live question about one spot, and it is
 * meant to be gone when you leave it. See `shared/searchPresets.ts`.
 */
export type SearchRun = {
  preset: SearchPreset;
  status: "searching" | "done" | "failed";
  /**
   * The radius this run actually asked for. ⚠️ Not read from `around` at render
   * time: the empty-result line tells the user to change the radius, so the
   * very next thing they do makes the live value disagree with the answer on
   * screen — "no benches within 15 km" over a result set fetched at 1 km.
   */
  radius: number;
  nodes: SearchResultNode[];
  /** Over the cap in this radius: nothing is drawn, on purpose. */
  tooMany: boolean;
};

type AppState = {
  openedNode: OpenStreetMapNode | null;
  /**
   * The search result whose sheet is open. ⚠️ A separate field from
   * `openedNode` rather than a widened one: a result carries raw OSM tags with
   * no `amenity` discriminant, and everything hanging off `openedNode`
   * (`isEditable`, `getAmenityMarker`, the edit button) reads that field.
   */
  openedResult: SearchResultNode | null;
  /** Non-null = the map is in search mode: only these results are drawn. */
  search: SearchRun | null;
  isSearchPickerOpen: boolean;
  upsertNode: UpsertNode | null;
  isMenuOpen: boolean;
  isAddMenuOpen: boolean;
  errorMessage: string | null;
  /**
   * The map centre has drifted outside the area of the last search. ⚠️ This
   * only picks the "search this area" button's *state* — the button itself is
   * always on screen, so a re-search is never gated behind having moved.
   */
  isSearchAreaStale: boolean;
  around: number;
  filters: Filters;
  showRadius: boolean;
  continousSearch: boolean;
  dataStatus: DataStatus;
  /** Set by Map so the status banner can offer a retry without prop drilling. */
  retryLastSearch: (() => void) | null;

  setOpenedNode: (node: OpenStreetMapNode | null) => void;
  setOpenedResult: (node: SearchResultNode | null) => void;
  setSearch: (search: SearchRun | null) => void;
  setIsSearchPickerOpen: (isOpen: boolean) => void;
  setUpsertNode: (node: UpsertNode | null) => void;
  setIsMenuOpen: (isOpen: boolean) => void;
  setIsAddMenuOpen: (isOpen: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  setIsSearchAreaStale: (stale: boolean) => void;
  setAround: (around: number) => void;
  setFilter: (amenity: Amenity, value: boolean) => void;
  setFilters: (filters: Filters) => void;
  /**
   * Show this amenity alone — or, if it is already the only one shown, bring
   * everything back. Double-tapping a pill is the fast way to say "just this",
   * and the same gesture has to be the way out of it.
   */
  toggleOnlyFilter: (amenity: Amenity) => void;
  /**
   * Show this amenity alone, full stop. ⚠️ Not the same call as the one above:
   * this one is reached from the search picker, where the amenity being asked
   * for is one the map already carries, and "you asked for benches, here is
   * everything" would be a strange answer to a search.
   */
  showOnlyFilter: (amenity: Amenity) => void;
  setShowRadius: (show: boolean) => void;
  setContinousSearch: (v: boolean) => void;
  setDataStatus: (status: DataStatus) => void;
  setRetryLastSearch: (fn: (() => void) | null) => void;
};

export const useAppStore = create<AppState>(set => ({
  openedNode: null,
  openedResult: null,
  search: null,
  isSearchPickerOpen: false,
  upsertNode: null,
  isMenuOpen: false,
  isAddMenuOpen: false,
  errorMessage: null,
  isSearchAreaStale: false,
  around: 1000,
  filters: allFiltersOn(),
  showRadius: true,
  continousSearch: false,
  dataStatus: null,
  retryLastSearch: null,

  setOpenedNode: node => set({ openedNode: node }),
  setOpenedResult: node => set({ openedResult: node }),
  setSearch: search =>
    // leaving search mode takes its open sheet with it: the result behind it is
    // about to stop being drawn
    set(search ? { search } : { search: null, openedResult: null }),
  setIsSearchPickerOpen: isOpen => set({ isSearchPickerOpen: isOpen }),
  setUpsertNode: node => set({ upsertNode: node }),
  setIsMenuOpen: isOpen => set({ isMenuOpen: isOpen }),
  setIsAddMenuOpen: isOpen => set({ isAddMenuOpen: isOpen }),
  setErrorMessage: msg => set({ errorMessage: msg }),
  setIsSearchAreaStale: stale => set({ isSearchAreaStale: stale }),
  setAround: around => set({ around }),
  setFilter: (amenity, value) =>
    set(state => ({
      filters: persist({ ...state.filters, [amenity]: value })
    })),
  setFilters: filters => set({ filters }),
  showOnlyFilter: amenity => set({ filters: persist(onlyFilter(amenity)) }),
  toggleOnlyFilter: amenity =>
    set(state => {
      /*
        ⚠️ "Is it already alone?" is decided by the OTHER pills only, never by
        this one. A double-tap delivers its two `click`s before `dblclick`, so
        by the time we get here the gesture has already toggled this very pill
        — asking whether it is on answers a question about our own side effect,
        and the second double-tap on a solo pill re-isolated it instead of
        restoring the row (reproduced 2026-08-18 in touch emulation). How many
        of those clicks the browser let through doesn't change the others.
        Nothing on at all reads as "show me things" and restores everything.
      */
      const othersOn = amenities.some(a => a !== amenity && state.filters[a]);
      return {
        filters: persist(othersOn ? onlyFilter(amenity) : allFiltersOn())
      };
    }),
  setShowRadius: show => set({ showRadius: show }),
  setContinousSearch: v => set({ continousSearch: v }),
  setDataStatus: status => set({ dataStatus: status }),
  setRetryLastSearch: fn => set({ retryLastSearch: fn })
}));

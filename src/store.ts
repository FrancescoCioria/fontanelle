import { create } from "zustand";
import localforage from "localforage";
import { amenities } from "./getOpenStreetMapAmenities";
import type { OpenStreetMapNode, Amenity } from "./getOpenStreetMapAmenities";
import type { UpsertNode } from "./UpsertNode";

type Filters = { [k in Amenity]: boolean };

const FILTERS_KEY = "filters";

const filtersWhere = (on: (amenity: Amenity) => boolean): Filters =>
  Object.fromEntries(amenities.map(a => [a, on(a)])) as Filters;

const allFiltersOn = () => filtersWhere(() => true);

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

type AppState = {
  openedNode: OpenStreetMapNode | null;
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
  setShowRadius: (show: boolean) => void;
  setContinousSearch: (v: boolean) => void;
  setDataStatus: (status: DataStatus) => void;
  setRetryLastSearch: (fn: (() => void) | null) => void;
};

export const useAppStore = create<AppState>(set => ({
  openedNode: null,
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
        filters: persist(
          othersOn ? filtersWhere(a => a === amenity) : allFiltersOn()
        )
      };
    }),
  setShowRadius: show => set({ showRadius: show }),
  setContinousSearch: v => set({ continousSearch: v }),
  setDataStatus: status => set({ dataStatus: status }),
  setRetryLastSearch: fn => set({ retryLastSearch: fn })
}));

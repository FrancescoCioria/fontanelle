import { create } from "zustand";
import type { OpenStreetMapNode, Amenity } from "./getOpenStreetMapAmenities";
import type { UpsertNode } from "./UpsertNode";

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
  filters: { [k in Amenity]: boolean };
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
  filters: {
    drinking_water: true,
    toilets: true,
    shower: true,
    bicycle_repair_station: true,
    public_bath: true,
    device_charging_station: true,
    playground: true,
    picnic: true,
    elevator: true
  },
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
    set(state => ({ filters: { ...state.filters, [amenity]: value } })),
  setShowRadius: show => set({ showRadius: show }),
  setContinousSearch: v => set({ continousSearch: v }),
  setDataStatus: status => set({ dataStatus: status }),
  setRetryLastSearch: fn => set({ retryLastSearch: fn })
}));

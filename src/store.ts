import { create } from "zustand";
import type { OpenStreetMapNode, Amenity } from "./getOpenStreetMapAmenities";
import type { UpsertNode } from "./UpsertNode";

/**
 * What the map can honestly say about the area currently on screen.
 * ⚠️ `empty` is a claim, not a shrug: only set when the server reports every
 * tile covering the area as fresh. Everything less certain gets its own kind.
 */
export type DataStatus =
  | { kind: "loading" }
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
  showSearchThisAreaButton: boolean;
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
  setShowSearchThisAreaButton: (show: boolean) => void;
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
  showSearchThisAreaButton: false,
  around: 1000,
  filters: {
    drinking_water: true,
    toilets: true,
    shower: true,
    bicycle_repair_station: true,
    public_bath: true,
    device_charging_station: true,
    playground: true,
    picnic: true
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
  setShowSearchThisAreaButton: show =>
    set({ showSearchThisAreaButton: show }),
  setAround: around => set({ around }),
  setFilter: (amenity, value) =>
    set(state => ({ filters: { ...state.filters, [amenity]: value } })),
  setShowRadius: show => set({ showRadius: show }),
  setContinousSearch: v => set({ continousSearch: v }),
  setDataStatus: status => set({ dataStatus: status }),
  setRetryLastSearch: fn => set({ retryLastSearch: fn })
}));

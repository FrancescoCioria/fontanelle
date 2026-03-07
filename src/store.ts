import { create } from "zustand";
import type { OpenStreetMapNode, Amenity } from "./getOpenStreetMapAmenities";
import type { UpsertNode } from "./UpsertNode";

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
    device_charging_station: true
  },
  showRadius: true,
  continousSearch: false,

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
  setContinousSearch: v => set({ continousSearch: v })
}));

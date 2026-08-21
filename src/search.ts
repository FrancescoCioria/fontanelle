import {
  SearchPreset,
  SearchResultNode
} from "../shared/searchPresets";

export {
  MAX_SEARCH_RESULTS,
  SEARCH_PRESETS,
  searchMatcher
} from "../shared/searchPresets";
export type { SearchPreset, SearchResultNode } from "../shared/searchPresets";

export type SearchAnswer = {
  nodes: SearchResultNode[];
  /** More than the cap in this radius: nothing is drawn, the radius must shrink. */
  tooMany: boolean;
};

/**
 * One live lookup, through our own server (`functions/api/search.ts`) — never
 * Overpass from here, same as the amenity path.
 *
 * ⚠️ Nothing is written to IndexedDB. A search result is not part of the map's
 * data: it has no pill, no sprite of its own, no write path, and above all no
 * tile to be invalidated with, so a copy kept locally could never be refreshed
 * or evicted and would quietly age forever. Leaving search mode is meant to
 * leave nothing behind.
 */
let currentRequest: AbortController | null = null;

/**
 * Drop whatever is in flight. ⚠️ Leaving search mode is a cancellation, not a
 * pause: the answer has nowhere to land any more. Without this the request ran
 * to completion for nobody — and the loading bar it started had no settled
 * promise to finish it.
 */
export const cancelPresetSearch = () => {
  if (currentRequest) currentRequest.abort();
};

export const runPresetSearch = async (
  preset: SearchPreset,
  area: { lat: number; lng: number; radius: number }
): Promise<SearchAnswer> => {
  // single-flight: picking a second preset while the first is in the air must
  // not leave two answers racing for the same piece of screen
  if (currentRequest) currentRequest.abort();

  const controller = new AbortController();
  currentRequest = controller;

  const params = new URLSearchParams({
    preset: preset.id,
    lat: String(area.lat),
    lon: String(area.lng),
    radius: String(area.radius)
  });

  try {
    const res = await fetch(`/api/search?${params}`, {
      signal: controller.signal
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json?.error || `search failed (${res.status})`);
    }

    return { nodes: json.nodes || [], tooMany: !!json.tooMany };
  } finally {
    if (currentRequest === controller) currentRequest = null;
  }
};

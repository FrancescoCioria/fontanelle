import React, { useRef, useEffect, useMemo } from "react";
import debounce from "lodash/debounce";
import getOpenStreetMapAmenities, {
  OpenStreetMapNode,
  updateCachedItems,
  Amenity,
  getAmenityTitle,
  getAmenityIcon,
  amenities,
  editableAmenities,
  mergeNearbyNodes,
  nodeKey,
  CACHE_KEY,
  RADIUS_MARGIN
} from "./getOpenStreetMapAmenities";
import distance from "@turf/distance";
import { formatDistance } from "./format";
import localforage from "localforage";
import MenuIcon from "./MenuIcon";
import MapboxCircle from "mapbox-gl-circle";
import LoadingBar, { LoadingBarRef } from "react-top-loading-bar";
import { Popup } from "./Popup";
import { UpsertNodePopup } from "./UpsertNode";
import { Button, Checkbox } from "./form";
import BottomSheet, { ResultSheet } from "./BottomSheet";
import {
  registerMapIcons,
  getIconName,
  getClusterIconName,
  sourceId,
  clusterLayerId,
  markerLayerId,
  CLUSTER_MAX_ZOOM,
  CLUSTER_RADIUS,
  SEARCH_SOURCE,
  SEARCH_CLUSTER_LAYER,
  SEARCH_MARKER_LAYER,
  SEARCH_ICON
} from "./mapIcons";
import Toast from "./Toast";
import DataStatus from "./DataStatus";
import SearchBar from "./SearchBar";
import SearchPicker from "./SearchPicker";
import {
  cancelPresetSearch,
  runPresetSearch,
  SearchPreset,
  SearchResultNode
} from "./search";
import { loadFilters, useAppStore } from "./store";

import "./map.scss";

const mapboxgl = window.mapboxgl;

/**
 * A `partial` answer means the server is still fetching tiles behind the reply
 * it just sent. Backing off rather than polling: an Overpass instance can
 * legitimately take a minute on a dense tile, and these delays add up to about
 * that. Each round returns everything landed so far, so an interrupted chain
 * still leaves the map fuller than it was.
 */
const PARTIAL_RETRY_DELAYS_MS = [4000, 8000, 15000, 30000, 60000, 60000];

/**
 * Zoom the locate button settles on: close enough to tell which side of the
 * street you're on. This is Mapbox's own default, pinned here so the opening
 * zoom below can be defined against it instead of drifting with the library.
 */
const LOCATE_ZOOM = 15;

/**
 * Zoom the app *opens* at, and the zoom the map keeps while it follows you —
 * deliberately wider than the button. At the default 1km search radius this is
 * where the whole searched circle fits a phone screen (~6.8 m/px at lat 45,
 * ~2.8km across): you land looking at everything the app just fetched, instead
 * of at one block of it.
 *
 * ⚠️ This is also the control's permanent `fitBoundsOptions.maxZoom`, and that
 * is not incidental. With `trackUserLocation`, Mapbox re-fits the camera on
 * *every* position update, so a higher cap means the map silently zooms in on
 * you as you walk (measured: 500m scale → 100m after two GPS ticks). Pressing
 * the locate button is the only thing that should take you in close.
 */
const OPENING_ZOOM = 13;

const amenitiesMapOrder: { [k in Amenity]: number } = {
  drinking_water: 1,
  shower: 2,
  toilets: 3,
  public_bath: 4,
  device_charging_station: 5,
  bicycle_repair_station: 6,
  playground: 7,
  picnic: 8,
  elevator: 9
};

/**
 * Maki icons the basemap draws for things this app draws itself.
 *
 * ⚠️ The style ("Outdoors", built 2019-01-04) rides on `mapbox-streets-v7`, a
 * frozen tileset: its POIs are an OSM snapshot from ~2019, so it both misses
 * everything mapped since and keeps objects at coordinates they have moved
 * away from. Parco Trotter, Milan, 2026-08-18: the basemap drew a toilet 12m
 * south of our pin — the same node (`5450827382`), at the position it had
 * before it was moved on 2024-11-15. Two icons, one toilet, and the stale one
 * is the one that can't be tapped.
 *
 * ⚠️ This is the fix CLAUDE.md points at for "the basemap draws its own
 * symbols where our pins stop": hide *those symbols*, don't widen the radius
 * the user set (tried 2026-08-10, reverted the next day).
 *
 * Only categories we render ourselves. `information`, `bicycle`,
 * `bicycle-share`, `park`, `garden` and the rest stay: nothing of ours would
 * take their place.
 */
const BASEMAP_MAKI_WE_DRAW = [
  "toilet",
  "drinking-water",
  "picnic-site",
  "playground"
];

/**
 * The look of a cluster bubble: the icon of whatever it groups, with the count
 * as a badge off its corner.
 *
 * ⚠️ `text-offset` is in ems of `text-size`, so it must step in lockstep with
 * `icon-size` or the badge drifts onto the icon body on bigger clusters. It is
 * written once here because both modes draw bubbles — the amenities and the
 * search results — and two copies of these numbers could drift by exactly the
 * one that makes it wrong.
 */
const clusterLayout = (icon: string): mapboxgl.SymbolLayout => ({
  "icon-image": icon,
  "icon-size": ["step", ["get", "point_count"], 1, 10, 1.2, 50, 1.4],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
  "text-field": ["get", "point_count_abbreviated"],
  "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
  "text-size": 13,
  "text-anchor": "left",
  "text-offset": [
    "step",
    ["get", "point_count"],
    ["literal", [0.75, 0.7]],
    10,
    ["literal", [0.95, 0.85]],
    50,
    ["literal", [1.1, 1]]
  ],
  "text-allow-overlap": true,
  "text-ignore-placement": true
});

const CLUSTER_PAINT: mapboxgl.SymbolPaint = {
  "text-color": "#0f172a",
  "text-halo-color": "#ffffff",
  "text-halo-width": 2.5
};

/**
 * ⚠️ By maki, across every `poi_label` layer — not by hiding one layer. The
 * style spreads POIs over ten layers by scalerank, and each one mixes icons we
 * duplicate with icons we don't: `poi-outdoor-features` carries toilets *and*
 * information boards, `poi-parks-*` carries playgrounds *and* parks. Measured
 * at the park on 2026-08-18: toilets and drinking water came from
 * `poi-outdoor-features` there, but scalerank decides that per POI, not per
 * category, so any of the ten can serve one on another screen.
 */
const hideBasemapDuplicates = (map: mapboxgl.Map) => {
  const exclude = ["!in", "maki", ...BASEMAP_MAKI_WE_DRAW];

  map
    .getStyle()
    .layers?.filter(layer => (layer as any)["source-layer"] === "poi_label")
    .forEach(layer => {
      const current = map.getFilter(layer.id);
      // legacy filter syntax, like the rest of this 2019 style: don't mix
      map.setFilter(layer.id, current ? ["all", current, exclude] : exclude);
    });
};

function MapFountains() {
  const openedNode = useAppStore(s => s.openedNode);
  const setOpenedNode = useAppStore(s => s.setOpenedNode);
  const upsertNode = useAppStore(s => s.upsertNode);
  const setUpsertNode = useAppStore(s => s.setUpsertNode);
  const isMenuOpen = useAppStore(s => s.isMenuOpen);
  const setIsMenuOpen = useAppStore(s => s.setIsMenuOpen);
  const around = useAppStore(s => s.around);
  const setAround = useAppStore(s => s.setAround);
  const filters = useAppStore(s => s.filters);
  const setFilter = useAppStore(s => s.setFilter);
  const setFilters = useAppStore(s => s.setFilters);
  const toggleOnlyFilter = useAppStore(s => s.toggleOnlyFilter);
  const showRadius = useAppStore(s => s.showRadius);
  const setShowRadius = useAppStore(s => s.setShowRadius);
  const continousSearch = useAppStore(s => s.continousSearch);
  const setContinousSearch = useAppStore(s => s.setContinousSearch);
  const isSearchAreaStale = useAppStore(s => s.isSearchAreaStale);
  const setIsSearchAreaStale = useAppStore(s => s.setIsSearchAreaStale);
  const isAddMenuOpen = useAppStore(s => s.isAddMenuOpen);
  const setIsAddMenuOpen = useAppStore(s => s.setIsAddMenuOpen);
  const errorMessage = useAppStore(s => s.errorMessage);
  const setErrorMessage = useAppStore(s => s.setErrorMessage);
  const setDataStatus = useAppStore(s => s.setDataStatus);
  const setRetryLastSearch = useAppStore(s => s.setRetryLastSearch);
  const search = useAppStore(s => s.search);
  const setSearch = useAppStore(s => s.setSearch);
  const setIsSearchPickerOpen = useAppStore(s => s.setIsSearchPickerOpen);
  const openedResult = useAppStore(s => s.openedResult);
  const setOpenedResult = useAppStore(s => s.setOpenedResult);

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const nodesRef = useRef<{ [id: string]: OpenStreetMapNode }>({});
  const circleRadiusRef = useRef<any>(null);
  const previousCenterRef = useRef<{ lng: number; lat: number }>({
    lng: 0,
    lat: 0
  });
  const loadingBarRef = useRef<LoadingBarRef>(null);
  const lastSourceDataRef = useRef<{ [k: string]: string }>({});
  // Center of the last API search, so an incoming GPS fix can tell whether it
  // landed inside already-fetched data (null = we haven't searched yet).
  const searchedCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const gpsResolvedRef = useRef(false);
  const gpsFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  // A `partial` answer means the server couldn't refresh every tile inside its
  // deadline. Nothing is lost — the tiles it did fetch are already in the
  // reply — so we simply come back for the rest.
  const partialRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Mirror state in refs so callbacks/event-handlers always read fresh values
  const aroundRef = useRef(around);
  aroundRef.current = around;
  const showRadiusRef = useRef(showRadius);
  showRadiusRef.current = showRadius;
  const continousSearchRef = useRef(continousSearch);
  continousSearchRef.current = continousSearch;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const searchRef = useRef(search);
  searchRef.current = search;
  // results by key, so a tapped feature can find the object it stands for —
  // the amenity path's `nodesRef` for the other mode
  const searchResultsRef = useRef<{ [k: string]: SearchResultNode }>({});
  const lastSearchNodesRef = useRef<SearchResultNode[] | null>(null);
  const isPickingCoordinatesRef = useRef(false);
  isPickingCoordinatesRef.current =
    upsertNode?.type === "create_without_coordinates" ||
    upsertNode?.type === "update_without_coordinates";

  // --- Helper functions (read from refs, so always up-to-date) ---

  function getMap(cb: (map: mapboxgl.Map) => void) {
    if (mapRef.current) cb(mapRef.current);
  }

  function updateGeoJsonSource() {
    getMap(map => {
      // null-prototype: an amenity read back from a stale cache entry could
      // otherwise be "toString" and inherit a truthy value from Object.prototype
      const byAmenity: { [k: string]: GeoJSON.Feature[] } = Object.create(null);
      amenities.forEach(amenity => (byAmenity[amenity] = []));

      // ⚠️ Amenity filtering happens here, not via `map.setFilter`: Mapbox
      // builds clusters from the source data, so a layer filter would hide
      // markers while still counting them in the cluster bubbles.
      mergeNearbyNodes(Object.values(nodesRef.current)).forEach(node => {
        const amenity = node.tags.amenity;
        if (!byAmenity[amenity] || !filtersRef.current[amenity]) return;

        byAmenity[amenity].push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [node.lon, node.lat]
          },
          properties: {
            key: nodeKey(node),
            amenity,
            icon: getIconName(node.tags)
          }
        });
      });

      amenities.forEach(amenity => {
        const source = map.getSource(sourceId(amenity)) as
          | mapboxgl.GeoJSONSource
          | undefined;
        if (!source) return;

        const data: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: byAmenity[amenity]
        };

        // ⚠️ Skip unchanged sources. setData rebuilds that source's supercluster
        // index and invalidates its cluster ids, which races the tap handler's
        // getClusterExpansionZoom — no reason to do that to 6 untouched sources
        // every time one filter pill is toggled.
        const serialized = JSON.stringify(data);
        if (lastSourceDataRef.current[amenity] === serialized) return;

        lastSourceDataRef.current[amenity] = serialized;
        source.setData(data);
      });
    });
  }

  function addAmenitiesMarkers(nodes: OpenStreetMapNode[]) {
    let changed = false;
    nodes.forEach(node => {
      if (node.tags?.amenity && !nodesRef.current[nodeKey(node)]) {
        nodesRef.current[nodeKey(node)] = node;
        changed = true;
      }
    });

    if (changed) {
      updateGeoJsonSource();
    }
  }

  function updateCachedAmenities(center?: { lat: number; lng: number }) {
    getMap(map => {
      const c = center ?? map.getCenter();

      localforage.getItem<OpenStreetMapNode[]>(CACHE_KEY).then(items => {
        if (items) {
          // ⚠️ The same circle the server answers with, margin included: the
          // offline copy has to draw the same points the network would, or a
          // pan makes the edge blink.
          const nodesInRadius = items.filter(
            node =>
              distance([c.lng, c.lat], [node.lon, node.lat], {
                units: "meters"
              }) <
              aroundRef.current * RADIUS_MARGIN
          );

          addAmenitiesMarkers(nodesInRadius);
        }
      });
    });
  }

  function updateAmenities(
    center?: { lat: number; lng: number },
    retry = 0
  ) {
    getMap(map => {
      const c = center ?? map.getCenter();
      updateCachedAmenities(c);

      // A newer search wins: drop any retry still queued for the old centre.
      if (partialRetryTimerRef.current) {
        clearTimeout(partialRetryTimerRef.current);
        partialRetryTimerRef.current = null;
      }

      // Remember where we searched so an incoming GPS fix can decide whether it
      // already sits inside fresh data or needs a new fetch.
      searchedCenterRef.current = { lat: c.lat, lng: c.lng };

      if (retry === 0) {
        // ⚠️ Whoever asked for this search, this area is now the searched one —
        // and this is the only place that says so, so the button's state can't
        // disagree with what was actually fetched. A retry round is the *same*
        // search continuing, and the user may have panned away meanwhile.
        setIsSearchAreaStale(false);

        // don't let the previous area's verdict sit over the new one
        setDataStatus(null);
      }

      // ⚠️ Only on a fresh search: a retry round is a continuation of the same
      // fill and the bar is still running from the previous one. Restarting it
      // there would throw the progress back to ~15% each round (the library
      // does not guard against a second continuousStart), which reads as
      // "starting over" rather than "still going".
      if (retry === 0 && loadingBarRef.current) {
        // @ts-ignore (continuousStart args are optional)
        loadingBarRef.current.continuousStart();
      }

      // let the banner offer a retry for exactly this search
      setRetryLastSearch(() => updateAmenitiesFnRef.current(c, 0));

      // ⚠️ The bar has to stay up across the *whole* fill, retries included, not
      // just while a request is on the wire. Between rounds this reply is
      // answered but the work is not done — the server is still fetching tiles
      // behind it — and a bar that finishes there says "this is everything",
      // over a map that is still missing pieces. Waiting is fine as long as the
      // app is honest that it is still working.
      let stillWorking = false;

      getOpenStreetMapAmenities({
        around: aroundRef.current,
        lat: c.lat,
        lng: c.lng
      })
        .then(({ nodes, partial, tiles }) => {
          addAmenitiesMarkers(nodes);

          const willRetry = partial && retry < PARTIAL_RETRY_DELAYS_MS.length;
          stillWorking = willRetry;

          if (willRetry) {
            partialRetryTimerRef.current = setTimeout(() => {
              partialRetryTimerRef.current = null;
              updateAmenitiesFnRef.current(c, retry + 1);
            }, PARTIAL_RETRY_DELAYS_MS[retry]);
          }

          // ⚠️ The order matters: an unreachable tile outranks everything, and
          // "nothing here" is claimed ONLY when the server says the whole area
          // is fresh — otherwise a slow load reads as an empty neighbourhood,
          // which is the confusion this banner exists to remove.
          if (tiles.unreachable > 0) {
            setDataStatus({
              kind: "unreachable",
              retrying: willRetry,
              hasData: nodes.length > 0
            });
          } else if (partial) {
            // ⚠️ Say it even when markers are already on screen. This used to go
            // quiet on the grounds that the top loading bar covers it — but the
            // bar is only up while a request is in flight, and between retries
            // that is a gap of up to a minute. Meanwhile a tile that hasn't
            // answered is a slice of the map with no pins on it, sitting next to
            // a full one: indistinguishable from empty countryside, which is the
            // whole complaint. A z12 tile takes 8–11s in a city against a 6s
            // budget (measured 2026-08-10), so this is the *normal* first answer
            // over anywhere new, not a rare edge.
            setDataStatus({
              kind: "incomplete",
              retrying: willRetry,
              hasData: nodes.length > 0
            });
          } else {
            setDataStatus(nodes.length > 0 ? null : { kind: "empty" });
          }
        })
        .catch(e => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setDataStatus({ kind: "offline" });
          setErrorMessage("Failed to load amenities. Please try again.");
        })
        .finally(() => {
          // a retry is queued for this same area: leave the bar running, the
          // next round picks it up where this one left it
          if (stillWorking) return;

          if (loadingBarRef.current) {
            loadingBarRef.current.complete();
          }
        });
    });
  }

  /**
   * Draws whatever the current search holds. ⚠️ No `mergeNearbyNodes` here: the
   * merge radii are measured per amenity (a playground mapped twice is one
   * playground; two fountains 20m apart are two fountains), and there is no
   * such number for a catalogue of seventy. A result is shown as OSM has it.
   */
  function updateSearchSource() {
    getMap(map => {
      const source = map.getSource(SEARCH_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!source) return;

      const nodes = searchRef.current?.nodes || [];

      // ⚠️ Identity, not content: a re-run of the same preset carries the
      // previous array through the "searching" state on purpose, and setData
      // would rebuild the supercluster index — invalidating the cluster ids the
      // tap handler is holding — to draw exactly what is already drawn.
      if (lastSearchNodesRef.current === nodes) return;
      lastSearchNodesRef.current = nodes;

      const byKey: { [k: string]: SearchResultNode } = Object.create(null);

      const features: GeoJSON.Feature[] = nodes.map(node => {
        const key = nodeKey(node);
        byKey[key] = node;

        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [node.lon, node.lat] },
          properties: { key, name: node.tags.name || "" }
        };
      });

      searchResultsRef.current = byKey;
      source.setData({ type: "FeatureCollection", features });
    });
  }

  /**
   * The mode switch, and the whole of it: in search mode every amenity layer is
   * hidden and the results layer is shown.
   *
   * ⚠️ Visibility, not empty sources. Blanking the eight amenity sources would
   * throw away eight supercluster indexes and rebuild them on the way back,
   * and the nodes are still in `nodesRef` either way — this is a question about
   * what is *drawn*, not about what is loaded. It also means a hidden layer
   * returns nothing from `queryRenderedFeatures`, so the tap handler needs no
   * mode branch of its own.
   */
  function applySearchMode(map: mapboxgl.Map) {
    const searching = !!searchRef.current;

    const setVisible = (layer: string, visible: boolean) => {
      if (map.getLayer(layer)) {
        map.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
      }
    };

    amenities.forEach(amenity => {
      setVisible(clusterLayerId(amenity), !searching);
      setVisible(markerLayerId(amenity), !searching);
    });

    setVisible(SEARCH_CLUSTER_LAYER, searching);
    setVisible(SEARCH_MARKER_LAYER, searching);
  }

  /**
   * One live lookup around a point. ⚠️ Nothing about it touches the amenity
   * path: no tiles, no D1 cache, no IndexedDB, no `partial` retry chain. It
   * either answers or it doesn't, and `SearchBar` says which.
   */
  function runSearch(preset: SearchPreset) {
    getMap(map => {
      const c = map.getCenter();

      // the sheet behind us is about to stop being drawn
      setOpenedNode(null);
      setOpenedResult(null);

      /*
        ⚠️ `isSearchAreaStale` and `previousCenterRef` are NOT touched here, and
        that is the whole point of them: they say whether the *amenity* data
        covers what is on screen, and a preset search fetches none of it. This
        used to clear the flag, so panning 5km inside search mode and then
        leaving it came back to a subdued "✓ Search again" over an area nobody
        had ever fetched — the button claiming a coverage that doesn't exist,
        which is exactly what "cleared in one place, `updateAmenities`" exists
        to prevent.
      */
      const radius = aroundRef.current;

      /*
        ⚠️ Re-running the same preset keeps the pins that are already up. They
        are the best answer available until the new one lands, and blanking the
        source only to refill it a second later is two supercluster rebuilds and
        a flash of empty map over the very area being asked about. A *different*
        preset clears at once: benches on screen while "Pharmacy" loads would be
        answering the wrong question.
      */
      const showing =
        searchRef.current?.preset.id === preset.id
          ? searchRef.current.nodes
          : [];

      setSearch({
        preset,
        status: "searching",
        radius,
        nodes: showing,
        tooMany: false
      });

      if (loadingBarRef.current) {
        // @ts-ignore (continuousStart args are optional)
        loadingBarRef.current.continuousStart();
      }

      /*
        ⚠️ There is exactly one answer to "is this reply still wanted", and it
        is the `AbortController` inside `runPresetSearch`: a newer search aborts
        the previous one, and leaving the mode calls `cancelPresetSearch`. Both
        supersessions therefore arrive here as an `AbortError`, and a settled
        promise's callbacks always run before the next click can be handled, so
        a stale reply cannot reach `setSearch`. This used to be tracked a second
        time by a run counter, which meant one question read from two sources —
        and both bugs it was written for (a late answer restoring search mode,
        and a loading bar left spinning after a back press) came out of the two
        disagreeing. ⚠️ No `.finally`: on abort the bar belongs to whoever
        aborted us — the newer search, or the leave path below.
      */
      runPresetSearch(preset, { lat: c.lat, lng: c.lng, radius })
        .then(({ nodes, tooMany }) => {
          setSearch({ preset, status: "done", radius, nodes, tooMany });
          if (loadingBarRef.current) loadingBarRef.current.complete();
        })
        .catch(e => {
          if (e instanceof DOMException && e.name === "AbortError") return;

          setSearch({
            preset,
            status: "failed",
            radius,
            nodes: [],
            tooMany: false
          });
          if (loadingBarRef.current) loadingBarRef.current.complete();
        });
    });
  }

  function showRadiusFn() {
    getMap(map => {
      const center = {
        lat: map.getCenter().lat,
        lng: map.getCenter().lng
      };

      if (circleRadiusRef.current) {
        circleRadiusRef.current.setCenter(center);
        circleRadiusRef.current.setRadius(aroundRef.current);
      } else {
        circleRadiusRef.current = new MapboxCircle(
          center,
          aroundRef.current,
          {
            editable: false,
            minRadius: 0,
            fillColor: "#0ea5e9",
            fillOpacity: 0.06,
            strokeColor: "#0ea5e9",
            strokeWeight: 1.5,
            strokeOpacity: 0.3
          }
        ).addTo(map);
      }
    });
  }

  function hideRadius() {
    if (circleRadiusRef.current) {
      circleRadiusRef.current.remove();
      circleRadiusRef.current = null;
    }
  }

  // Ref to always have the latest updateAmenities for the debounce
  const updateAmenitiesFnRef = useRef(updateAmenities);
  updateAmenitiesFnRef.current = updateAmenities;

  // Stable debounced function (created once, reads from refs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateAmenitiesDebounce = useMemo(
    () =>
      debounce(() => {
        const map = mapRef.current;
        if (!map) return;

        const distanceInMeters = distance(
          [map.getCenter().lat, map.getCenter().lng],
          [previousCenterRef.current.lat, previousCenterRef.current.lng],
          { units: "meters" }
        );

        if (distanceInMeters > aroundRef.current / 2) {
          // Say it either way: with continous search on, the fetch below clears
          // the flag again as soon as it starts, so the button doesn't claim
          // "covered" during the gap between the pan and the request.
          setIsSearchAreaStale(true);

          // ⚠️ Not while a search is on screen: those amenities aren't drawn,
          // so this would spend an Overpass round trip (and the loading bar) on
          // something the user cannot see. The flag above still moves, so the
          // button is right the moment they come back.
          if (continousSearchRef.current && !searchRef.current) {
            previousCenterRef.current = map.getCenter();
            updateAmenitiesFnRef.current();
          }
        } else {
          setIsSearchAreaStale(false);
        }
      }, 800),
    []
  );

  // Ref to always have the latest showRadiusFn for the map move handler
  const showRadiusFnRef = useRef(showRadiusFn);
  showRadiusFnRef.current = showRadiusFn;

  // --- Effects ---

  // Initialization (replaces componentDidMount)
  useEffect(() => {
    let mapInstance: mapboxgl.Map | null = null;

    // initialize persisted settings
    localforage
      .getItem<number>("around")
      .then(v => setAround(v || 1000));

    localforage.getItem<boolean>("showRadius").then(v => {
      setShowRadius(v === null ? true : v);
    });

    localforage
      .getItem<boolean>("continousSearch")
      .then(v => setContinousSearch(v || false));

    loadFilters().then(setFilters);

    // initialize map
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

    // Use saved position or default to Milan
    let initial = { lat: 45.4642, lng: 9.19 };
    try {
      const saved = localStorage.getItem("lastPosition");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
          initial = parsed;
        }
      }
    } catch { /* ignore corrupt data */ }

    // Seed the "have we moved far since the last fetch?" baseline with where we
    // actually start (and fetch for, in on("load")). ⚠️ Leaving it at {0,0} made
    // the debounce treat the very first real move — the GPS jump that flies the
    // map to the user on open — as the throwaway first run: it got swallowed, so
    // no data loaded for the user's location and the "search this area" button
    // never appeared.
    previousCenterRef.current = { lng: initial.lng, lat: initial.lat };

    const map = new mapboxgl.Map({
      container: "map",
      style:
        "mapbox://styles/francescocioria/cjqi3u6lmame92rmw6aw3uyhm?optimize=true",
      center: initial,
      zoom: OPENING_ZOOM,
      scrollZoom:
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        )
          ? false
          : true
    });

    mapInstance = map;

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true
      },
      showUserHeading: true,
      showAccuracyCircle: true,
      trackUserLocation: true,
      fitBoundsOptions: { maxZoom: OPENING_ZOOM }
    });

    // A press of the locate button means "take me in close" — the one moment a
    // zoom change is asked for rather than imposed. ⚠️ The zoom has to happen
    // on the position event, not here: the control fits the camera itself right
    // after this fires, and would undo an earlier easeTo.
    let zoomInOnNextFix = false;

    geolocate.on("trackuserlocationstart", () => {
      // the opening trigger is ours, not the user's, and stays wide
      zoomInOnNextFix = gpsResolvedRef.current;
    });
    map.addControl(geolocate, "bottom-right");

    // Opening the app should show what's around you *now*. When GPS answers,
    // search around the user — but only if that fix falls outside the circle we
    // already searched, so standing still (trackUserLocation fires repeatedly)
    // or a fix near the opening spot doesn't refetch. Walking out of the circle
    // later re-triggers it too.
    geolocate.on("geolocate", (e: any) => {
      const gps = { lat: e.coords.latitude, lng: e.coords.longitude };

      if (zoomInOnNextFix) {
        zoomInOnNextFix = false;
        map.easeTo({ center: gps, zoom: LOCATE_ZOOM });
      }

      gpsResolvedRef.current = true;
      if (gpsFallbackTimerRef.current) {
        clearTimeout(gpsFallbackTimerRef.current);
        gpsFallbackTimerRef.current = null;
      }

      const searched = searchedCenterRef.current;
      const insideSearched =
        searched &&
        distance([searched.lng, searched.lat], [gps.lng, gps.lat], {
          units: "meters"
        }) <= aroundRef.current;
      if (insideSearched) return;

      // Baseline the move-debounce to the user's spot so the control's fly-to
      // doesn't leave the button reading "stale" on top of the fetch we're
      // about to run (which clears the flag itself).
      previousCenterRef.current = { lng: gps.lng, lat: gps.lat };
      updateAmenitiesFnRef.current(gps);
    });

    // GPS denied/unavailable → don't leave the map empty; search the opening
    // position instead of waiting out the fallback timer.
    geolocate.on("error", () => {
      if (gpsResolvedRef.current) return;
      gpsResolvedRef.current = true;
      if (gpsFallbackTimerRef.current) {
        clearTimeout(gpsFallbackTimerRef.current);
        gpsFallbackTimerRef.current = null;
      }
      previousCenterRef.current = map.getCenter();
      updateAmenitiesFnRef.current();
    });

    map.addControl(
      new mapboxgl.NavigationControl({
        showZoom: false,
        showCompass: true
      }),
      "bottom-right"
    );

    map.addControl(new mapboxgl.ScaleControl());

    map.on("load", async () => {
      hideBasemapDuplicates(map);

      // ⚠️ mapRef is published only after the sources exist (below). Setting it
      // here would let updateGeoJsonSource run during the await and no-op on
      // missing sources, losing markers until the next pan.
      await registerMapIcons(map);

      // Least-important first: later layers draw on top, which reproduces the
      // old symbol-sort-key priority (drinking water above everything).
      const byPriority = [...amenities].sort(
        (a, b) => amenitiesMapOrder[b] - amenitiesMapOrder[a]
      );

      byPriority.forEach(amenity => {
        map.addSource(sourceId(amenity), {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterRadius: CLUSTER_RADIUS
        });

        map.addLayer({
          id: clusterLayerId(amenity),
          type: "symbol",
          source: sourceId(amenity),
          filter: ["has", "point_count"],
          // the amenity's own icon, so a cluster still says WHAT it groups
          layout: clusterLayout(getClusterIconName(amenity)),
          paint: CLUSTER_PAINT
        });
      });

      // ⚠️ All markers go above ALL clusters, in a second pass. Interleaving
      // them per-amenity would let one type's cluster paint over another type's
      // marker, while the tap handler — which checks markers first — still
      // resolved to the hidden marker underneath.
      byPriority.forEach(amenity => {
        map.addLayer({
          id: markerLayerId(amenity),
          type: "symbol",
          source: sourceId(amenity),
          filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": ["get", "icon"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true
          }
        });
      });

      // The other mode, added last so its results paint above everything —
      // though nothing else is visible while they are. Hidden until a search
      // happens; `applySearchMode` owns that switch from here on.
      map.addSource(SEARCH_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: CLUSTER_RADIUS
      });

      map.addLayer({
        id: SEARCH_CLUSTER_LAYER,
        type: "symbol",
        source: SEARCH_SOURCE,
        filter: ["has", "point_count"],
        layout: { ...clusterLayout(SEARCH_ICON), visibility: "none" },
        paint: CLUSTER_PAINT
      });

      map.addLayer({
        id: SEARCH_MARKER_LAYER,
        type: "symbol",
        source: SEARCH_SOURCE,
        filter: ["!", ["has", "point_count"]],
        layout: {
          visibility: "none",
          "icon-image": SEARCH_ICON,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          // ⚠️ The name is most of the answer here, and the reason results can
          // afford one label each: they are one category at a time, so the pin
          // says nothing the bar hasn't already said. `text-optional` keeps a
          // label that doesn't fit from taking its icon down with it.
          "text-field": ["get", "name"],
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 11,
          "text-anchor": "top",
          "text-offset": [0, 0.9],
          "text-optional": true
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2
        }
      });

      mapRef.current = map;

      const markerLayers = amenities.map(markerLayerId);
      const clusterLayers = amenities.map(clusterLayerId);

      // A single handler for every layer: per-layer `map.on("click", layer)`
      // listeners fire independently, so one tap landing on an icon that
      // overlaps a cluster bubble would open the sheet AND zoom away.
      map.on("click", e => {
        // the map stays live under the coordinate-picking overlay, and a stray
        // easeTo there would silently move the pin the user is placing
        if (isPickingCoordinatesRef.current) return;

        // ⚠️ No mode branch: outside search mode these layers are hidden, and
        // a hidden layer renders nothing for `queryRenderedFeatures` to find.
        const [result] = map.queryRenderedFeatures(e.point, {
          layers: [SEARCH_MARKER_LAYER]
        });

        if (result?.properties?.key) {
          const node = searchResultsRef.current[result.properties.key];
          if (node) setOpenedResult(node);
          return;
        }

        const [marker] = map.queryRenderedFeatures(e.point, {
          layers: markerLayers
        });

        if (marker?.properties?.key) {
          const node = nodesRef.current[marker.properties.key];
          if (node) setOpenedNode(node);
          return;
        }

        const [cluster] = map.queryRenderedFeatures(e.point, {
          layers: [...clusterLayers, SEARCH_CLUSTER_LAYER]
        });

        if (!cluster) return;

        const center = (cluster.geometry as GeoJSON.Point).coordinates as [
          number,
          number
        ];
        // each amenity has its own source, so expand against the one it came from
        const source = map.getSource(
          cluster.source
        ) as mapboxgl.GeoJSONSource;

        source.getClusterExpansionZoom(cluster.properties!.cluster_id, (err, zoom) => {
          // cluster ids are invalidated by every setData, so a refresh landing
          // between tap and reply makes this fail — still zoom in, just coarsely
          map.easeTo({ center, zoom: err ? map.getZoom() + 2 : zoom });
        });
      });

      // Pointer cursor on hover
      [
        ...markerLayers,
        ...clusterLayers,
        SEARCH_MARKER_LAYER,
        SEARCH_CLUSTER_LAYER
      ].forEach(layer => {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      });

      // Show cached markers for the opening position instantly (offline-friendly),
      // but hold the API search until GPS says where the user actually is — see
      // the geolocate handler above. If GPS never answers, fall back to searching
      // the opening position so the map still fills in.
      updateCachedAmenities();

      if (showRadiusRef.current) {
        showRadiusFnRef.current();
      }

      gpsFallbackTimerRef.current = setTimeout(() => {
        if (gpsResolvedRef.current) return;
        gpsResolvedRef.current = true;
        previousCenterRef.current = map.getCenter();
        updateAmenitiesFnRef.current();
      }, 6000);

      (
        document.querySelector(".mapboxgl-ctrl-geolocate") as HTMLElement
      )?.click();
    });

    map.on("move", () => {
      updateAmenitiesDebounce();

      requestAnimationFrame(() => {
        if (showRadiusRef.current) {
          showRadiusFnRef.current();
        }
      });
    });

    // Save position on moveend for next app launch
    map.on("moveend", () => {
      const center = map.getCenter();
      localStorage.setItem(
        "lastPosition",
        JSON.stringify({ lat: center.lat, lng: center.lng })
      );
    });

    return () => {
      if (gpsFallbackTimerRef.current) {
        clearTimeout(gpsFallbackTimerRef.current);
        gpsFallbackTimerRef.current = null;
      }
      if (partialRetryTimerRef.current) {
        clearTimeout(partialRetryTimerRef.current);
        partialRetryTimerRef.current = null;
      }
      if (mapInstance) {
        mapInstance.remove();
        mapRef.current = null;
        circleRadiusRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize map on re-render (replaces componentDidUpdate)
  useEffect(() => {
    requestAnimationFrame(() => {
      getMap(map => map.resize());
    });
  });

  // Rebuild the source when filters change, so cluster counts stay in sync
  useEffect(() => {
    updateGeoJsonSource();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Entering *and* leaving search mode: the same call puts the amenity layers
  // back, so there is one place that decides what the map is showing.
  useEffect(() => {
    if (!search) {
      // Leaving cancels: the answer has nowhere to land, and the request stops
      // being downloaded for nobody. ⚠️ The bar this run started is finished
      // here, because the aborted promise deliberately doesn't touch it.
      cancelPresetSearch();
      if (loadingBarRef.current) loadingBarRef.current.complete();
    }

    getMap(map => {
      applySearchMode(map);
      updateSearchSource();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // --- Render ---

  /**
   * Who owns the bottom of the screen. ⚠️ One name for a question asked at
   * several gates: a third openable thing must not mean remembering to add a
   * term to each of them, because a forgotten one is an overlap, not an error.
   */
  const sheetIsOpen = !!(openedNode || openedResult || upsertNode);

  /**
   * The one decision behind "Search this area", read three times by the button.
   *
   * ⚠️ In search mode it re-runs the *search* — the button means "answer the
   * question I'm asking, here" — and is never "covered": a search is answered
   * live from nothing, so no area is ever already done. `isSearchAreaStale`
   * belongs to the amenity data, which this mode neither draws nor fetches.
   */
  const areaAction = search
    ? { covered: false, run: () => runSearch(search.preset) }
    : {
        covered: !isSearchAreaStale,
        run: () =>
          getMap(map => {
            previousCenterRef.current = map.getCenter();
            updateAmenities();
          })
      };

  const pillConfig: Record<Amenity, { label: string; color: string }> = {
    drinking_water: { label: "Water", color: "#0ea5e9" },
    toilets: { label: "Toilets", color: "#8b5cf6" },
    shower: { label: "Showers", color: "#f97316" },
    bicycle_repair_station: { label: "Bike Repair", color: "#10b981" },
    public_bath: { label: "Baths", color: "#ec4899" },
    device_charging_station: { label: "Charging", color: "#eab308" },
    playground: { label: "Playgrounds", color: "#f43f5e" },
    picnic: { label: "Picnic", color: "#92400e" },
    elevator: { label: "Elevators", color: "#475569" }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%"
      }}
    >
      <div style={{ display: "flex" }}>
        <LoadingBar ref={loadingBarRef} color="lightgreen" height={8} />
      </div>

      <div id="map" style={{ display: "flex", flexGrow: 1 }} />

      {!search && (
      <div className="filter-pills">
        {/*
          The way into the other mode, and deliberately the first thing in the
          row: this strip scrolls, and an entry point you have to scroll to find
          is one nobody finds. It is not a filter — it doesn't toggle anything —
          so it doesn't wear a filter's colours.
        */}
        <button
          className="filter-pill filter-pill--search"
          aria-label="Search for a place type"
          onClick={() => setIsSearchPickerOpen(true)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          Search
        </button>

        {amenities.map(amenity => {
          const { label, color } = pillConfig[amenity];
          const active = filters[amenity];
          return (
            <button
              key={amenity}
              className="filter-pill"
              style={{
                borderColor: color,
                color: active ? "#fff" : color,
                backgroundColor: active ? color : "#fff"
              }}
              /*
                ⚠️ The double-tap window is the browser's, not ours: no timer,
                no threshold. `dblclick` fires from a double tap too (measured
                in Chromium touch emulation at both 80ms and 200ms gaps), and
                `touch-action: manipulation` on the pill takes double-tap-zoom
                out of its way. The two `click`s still fire first, so a
                double-tap would otherwise toggle the pill off and back on
                under the user's finger; `detail >= 2` is the browser telling
                us the second one belongs to a double-tap, and we leave that
                one to `onDoubleClick`.
              */
              onClick={e => {
                if (e.detail >= 2) return;
                setFilter(amenity, !active);
              }}
              onDoubleClick={() => toggleOnlyFilter(amenity)}
            >
              {label}
            </button>
          );
        })}
      </div>
      )}

      {search && (
        <SearchBar onRetry={() => runSearch(search.preset)} />
      )}

      <SearchPicker onPick={runSearch} />

      {/* the tile-freshness banner has nothing true to say about a search —
          SearchBar carries that mode's own status */}
      {!search && <DataStatus />}

      {openedNode && <BottomSheet />}
      {openedResult && <ResultSheet />}

      {/*
        ⚠️ Always on screen; only the node sheet and the add/edit flow, which
        own this strip themselves, take it away. It used to appear *only* after
        panning half a radius away, which meant the one way to re-run a search
        over the area you were already looking at was to pan off and come back.
        Coverage is a **state** of the button, never a gate on it: the subdued
        "Search again" says the area is done, and searches anyway when pressed.
      */}
      {!sheetIsOpen && (
        <button
          className={`search-this-area-button${
            areaAction.covered ? " search-this-area-button--covered" : ""
          }`}
          onClick={areaAction.run}
        >
          {!areaAction.covered ? (
            "Search this area"
          ) : (
            <>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Search again
            </>
          )}
        </button>
      )}

      {upsertNode && mapRef.current && (
        <UpsertNodePopup
          map={mapRef.current}
          onDone={(
            node: OpenStreetMapNode,
            action: "create" | "update" | "delete"
          ) => {
            if (action === "delete") {
              delete nodesRef.current[nodeKey(node)];
            } else {
              nodesRef.current[nodeKey(node)] = node;
              updateCachedItems([node]);
            }

            updateGeoJsonSource();
            setUpsertNode(null);
          }}
        />
      )}

      <button
        className="menu-button"
        aria-label="Search options"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          ...(openedNode ? { zIndex: 2 } : {})
        }}
        onClick={() => setIsMenuOpen(true)}
      >
        <MenuIcon />
      </button>

      <Popup
        onClose={() => {
          setIsMenuOpen(false);
        }}
        isOpen={isMenuOpen}
        aria-label="Search options"
      >
        <h4>Search options</h4>

        <div className="radius-control">
          <div className="radius-control-header">
            <span className="radius-control-label">Search radius</span>
            <span className="radius-control-value">{formatDistance(around)}</span>
          </div>
          <input
            aria-label="Search radius"
            value={around}
            type="range"
            min="500"
            max="15000"
            step="500"
            onChange={e => {
              const newAround = parseInt(e.currentTarget.value) || 1000;

              setAround(newAround);
              aroundRef.current = newAround;

              if (showRadiusRef.current) {
                showRadiusFn();
              }

              localforage.setItem("around", newAround);
            }}
          />
        </div>

        <div style={{ height: 16 }} />

        <Checkbox
          value={showRadius}
          label="Show radius in map"
          onChange={sr => {
            setShowRadius(sr);
            localforage.setItem("showRadius", sr);

            if (sr) {
              showRadiusFn();
            } else {
              hideRadius();
            }
          }}
        />

        <Checkbox
          value={continousSearch}
          label="Enable continous search"
          onChange={cs => {
            setContinousSearch(cs);
            localforage.setItem("continousSearch", cs);
          }}
        />

      </Popup>

      {/* nothing in the catalogue is writable, so the add button has no
          meaning while a search is on screen */}
      {!upsertNode && !search && (
        <button
          className="add-button"
          aria-label="Add new amenity"
          onClick={() => setIsAddMenuOpen(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      <Popup onClose={() => setIsAddMenuOpen(false)} isOpen={isAddMenuOpen} aria-label="Add new amenity">
        <h4 style={{ marginTop: 0 }}>Add new amenity</h4>
        <span style={{ fontSize: 13, color: "#64748b" }}>OSM account required</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          {editableAmenities.map(amenity => (
            <Button
              key={amenity}
              label={getAmenityTitle(amenity)}
              icon={getAmenityIcon(amenity, 24)}
              onClick={() => {
                setIsAddMenuOpen(false);
                setUpsertNode({
                  type: "create_without_coordinates",
                  node: {
                    tags: { amenity }
                  }
                });
              }}
            />
          ))}
        </div>
      </Popup>

      {errorMessage && (
        <Toast
          message={errorMessage}
          onDismiss={() => setErrorMessage(null)}
        />
      )}
    </div>
  );
}

export default MapFountains;

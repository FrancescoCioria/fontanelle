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
  CACHE_KEY
} from "./getOpenStreetMapAmenities";
import distance from "@turf/distance";
import localforage from "localforage";
import MenuIcon from "./MenuIcon";
import MapboxCircle from "mapbox-gl-circle";
import LoadingBar, { LoadingBarRef } from "react-top-loading-bar";
import { Popup } from "./Popup";
import { UpsertNodePopup } from "./UpsertNode";
import { Button, Checkbox } from "./form";
import BottomSheet from "./BottomSheet";
import {
  registerMapIcons,
  getIconName,
  getClusterIconName,
  sourceId,
  clusterLayerId,
  markerLayerId,
  CLUSTER_MAX_ZOOM,
  CLUSTER_RADIUS
} from "./mapIcons";
import Toast from "./Toast";
import { useAppStore } from "./store";

import "./map.scss";

const mapboxgl = window.mapboxgl;

const amenitiesMapOrder: { [k in Amenity]: number } = {
  drinking_water: 1,
  shower: 2,
  toilets: 3,
  public_bath: 4,
  device_charging_station: 5,
  bicycle_repair_station: 6,
  playground: 7,
  picnic: 8
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
  const showRadius = useAppStore(s => s.showRadius);
  const setShowRadius = useAppStore(s => s.setShowRadius);
  const continousSearch = useAppStore(s => s.continousSearch);
  const setContinousSearch = useAppStore(s => s.setContinousSearch);
  const showSearchThisAreaButton = useAppStore(
    s => s.showSearchThisAreaButton
  );
  const setShowSearchThisAreaButton = useAppStore(
    s => s.setShowSearchThisAreaButton
  );
  const isAddMenuOpen = useAppStore(s => s.isAddMenuOpen);
  const setIsAddMenuOpen = useAppStore(s => s.setIsAddMenuOpen);
  const errorMessage = useAppStore(s => s.errorMessage);
  const setErrorMessage = useAppStore(s => s.setErrorMessage);

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const nodesRef = useRef<{ [id: string]: OpenStreetMapNode }>({});
  const circleRadiusRef = useRef<any>(null);
  const previousCenterRef = useRef<{ lng: number; lat: number }>({
    lng: 0,
    lat: 0
  });
  const loadingBarRef = useRef<LoadingBarRef>(null);
  const lastSourceDataRef = useRef<{ [k: string]: string }>({});

  // Mirror state in refs so callbacks/event-handlers always read fresh values
  const aroundRef = useRef(around);
  aroundRef.current = around;
  const showRadiusRef = useRef(showRadius);
  showRadiusRef.current = showRadius;
  const continousSearchRef = useRef(continousSearch);
  continousSearchRef.current = continousSearch;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
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

  function updateCachedAmenities() {
    getMap(map => {
      const center = map.getCenter();

      localforage.getItem<OpenStreetMapNode[]>(CACHE_KEY).then(items => {
        if (items) {
          const nodesInRadius = items.filter(node => {
            const distanceInMeters = distance(
              [center.lng, center.lat],
              [node.lon, node.lat],
              { units: "meters" }
            );

            return distanceInMeters < aroundRef.current;
          });

          addAmenitiesMarkers(nodesInRadius);
        }
      });
    });
  }

  function updateAmenities() {
    getMap(map => {
      updateCachedAmenities();

      if (loadingBarRef.current) {
        // @ts-ignore (continuousStart args are optional)
        loadingBarRef.current.continuousStart();
      }

      getOpenStreetMapAmenities({
        around: aroundRef.current,
        lat: map.getCenter().lat,
        lng: map.getCenter().lng
      })
        .then(addAmenitiesMarkers)
        .catch(e => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setErrorMessage("Failed to load amenities. Please try again.");
        })
        .finally(() => {
          if (loadingBarRef.current) {
            loadingBarRef.current.complete();
          }
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
          if (continousSearchRef.current) {
            previousCenterRef.current = map.getCenter();
            updateAmenitiesFnRef.current();
          } else {
            setShowSearchThisAreaButton(true);
          }
        } else {
          setShowSearchThisAreaButton(false);
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
      zoom: 15.0,
      scrollZoom:
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        )
          ? false
          : true
    });

    mapInstance = map;

    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true
        },
        showUserHeading: true,
        showAccuracyCircle: true,
        trackUserLocation: true
      }),
      "bottom-right"
    );

    map.addControl(
      new mapboxgl.NavigationControl({
        showZoom: false,
        showCompass: true
      }),
      "bottom-right"
    );

    map.addControl(new mapboxgl.ScaleControl());

    map.on("load", async () => {
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
          layout: {
            // the amenity's own icon, so a cluster still says WHAT it groups
            "icon-image": getClusterIconName(amenity),
            "icon-size": ["step", ["get", "point_count"], 1, 10, 1.2, 50, 1.4],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            // count as a badge off the icon's corner. ⚠️ text-offset is in ems
            // of text-size, so it has to step in lockstep with icon-size or the
            // badge drifts onto the icon body on bigger clusters.
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
          },
          paint: {
            "text-color": "#0f172a",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2.5
          }
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

        const [marker] = map.queryRenderedFeatures(e.point, {
          layers: markerLayers
        });

        if (marker?.properties?.key) {
          const node = nodesRef.current[marker.properties.key];
          if (node) setOpenedNode(node);
          return;
        }

        const [cluster] = map.queryRenderedFeatures(e.point, {
          layers: clusterLayers
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
      [...markerLayers, ...clusterLayers].forEach(layer => {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      });

      updateAmenitiesFnRef.current();

      if (showRadiusRef.current) {
        showRadiusFnRef.current();
      }

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

  // --- Render ---

  const pillConfig: Record<Amenity, { label: string; color: string }> = {
    drinking_water: { label: "Water", color: "#0ea5e9" },
    toilets: { label: "Toilets", color: "#8b5cf6" },
    shower: { label: "Showers", color: "#f97316" },
    bicycle_repair_station: { label: "Bike Repair", color: "#10b981" },
    public_bath: { label: "Baths", color: "#ec4899" },
    device_charging_station: { label: "Charging", color: "#eab308" },
    playground: { label: "Playgrounds", color: "#f43f5e" },
    picnic: { label: "Picnic", color: "#92400e" }
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

      <div className="filter-pills">
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
              onClick={() => setFilter(amenity, !active)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {openedNode && <BottomSheet />}

      {showSearchThisAreaButton && openedNode === null && (
        <button
          className="search-this-area-button"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={() => {
            getMap(map => {
              previousCenterRef.current = map.getCenter();
              updateAmenities();

              setShowSearchThisAreaButton(false);
            });
          }}
        >
          Search this area
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
            <span className="radius-control-value">{around >= 1000 ? `${(around / 1000).toFixed(around % 1000 === 0 ? 0 : 1)} km` : `${around} m`}</span>
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
            setShowSearchThisAreaButton(false);
            localforage.setItem("continousSearch", cs);
          }}
        />

      </Popup>

      {!upsertNode && (
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

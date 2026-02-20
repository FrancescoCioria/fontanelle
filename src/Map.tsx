import React, { useRef, useEffect, useMemo } from "react";
import debounce from "lodash/debounce";
import getOpenStreetMapAmenities, {
  OpenStreetMapNode,
  updateCachedItems,
  Amenity,
  getAmenityTitle,
  amenities
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
  AMENITIES_SOURCE,
  AMENITIES_LAYER
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
  bicycle_repair_station: 6
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

  // Mirror state in refs so callbacks/event-handlers always read fresh values
  const aroundRef = useRef(around);
  aroundRef.current = around;
  const showRadiusRef = useRef(showRadius);
  showRadiusRef.current = showRadius;
  const continousSearchRef = useRef(continousSearch);
  continousSearchRef.current = continousSearch;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // --- Helper functions (read from refs, so always up-to-date) ---

  function getMap(cb: (map: mapboxgl.Map) => void) {
    if (mapRef.current) cb(mapRef.current);
  }

  function updateGeoJsonSource() {
    getMap(map => {
      const source = map.getSource(AMENITIES_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!source) return;

      const features: GeoJSON.Feature[] = Object.values(nodesRef.current).map(
        node => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [node.lon, node.lat]
          },
          properties: {
            id: node.id,
            amenity: node.tags.amenity,
            icon: getIconName(node.tags),
            sortOrder: amenitiesMapOrder[node.tags.amenity]
          }
        })
      );

      source.setData({
        type: "FeatureCollection",
        features
      });
    });
  }

  function updateLayerFilter() {
    getMap(map => {
      const enabledAmenities = amenities.filter(a => filtersRef.current[a]);

      if (enabledAmenities.length === amenities.length) {
        map.setFilter(AMENITIES_LAYER, null);
      } else if (enabledAmenities.length === 0) {
        map.setFilter(AMENITIES_LAYER, false);
      } else {
        map.setFilter(AMENITIES_LAYER, [
          "match",
          ["get", "amenity"],
          enabledAmenities,
          true,
          false
        ]);
      }
    });
  }

  function addAmenitiesMarkers(nodes: OpenStreetMapNode[]) {
    let changed = false;
    nodes.forEach(node => {
      if (!nodesRef.current[node.id]) {
        nodesRef.current[node.id] = node;
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

      localforage.getItem<OpenStreetMapNode[]>("amenities").then(items => {
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
        .catch(() => {
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
            fillColor: "transparent"
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

        if (
          previousCenterRef.current.lat === 0 &&
          previousCenterRef.current.lng === 0
        ) {
          previousCenterRef.current = map.getCenter();
          return;
        }

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
      }, 1000),
    []
  );

  // Ref to always have the latest showRadiusFn for the map move handler
  const showRadiusFnRef = useRef(showRadiusFn);
  showRadiusFnRef.current = showRadiusFn;

  // --- Effects ---

  // Initialization (replaces componentDidMount)
  useEffect(() => {
    let aborted = false;
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
    mapboxgl.accessToken =
      "pk.eyJ1IjoiZnJhbmNlc2NvY2lvcmlhIiwiYSI6ImNqcThyejR6ODA2ZDk0M25rZzZjcGo4ZmcifQ.yRWHQbG1dJjDp43d01bBOw";

    const positionCallback = (coords: {
      latitude: number;
      longitude: number;
    }) => {
      if (aborted) return;

      const map = new mapboxgl.Map({
        container: "map",
        style:
          "mapbox://styles/francescocioria/cjqi3u6lmame92rmw6aw3uyhm?optimize=true",
        center: {
          lat: coords.latitude,
          lng: coords.longitude
        },
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
        mapRef.current = map;

        await registerMapIcons(map);

        map.addSource(AMENITIES_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] }
        });

        map.addLayer({
          id: AMENITIES_LAYER,
          type: "symbol",
          source: AMENITIES_SOURCE,
          layout: {
            "icon-image": ["get", "icon"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "symbol-sort-key": ["get", "sortOrder"]
          }
        });

        // Click handler
        map.on("click", AMENITIES_LAYER, e => {
          const feature = e.features?.[0];
          if (feature?.properties?.id) {
            const node = nodesRef.current[feature.properties.id];
            if (node) {
              setOpenedNode(node);
            }
          }
        });

        // Pointer cursor on hover
        map.on("mouseenter", AMENITIES_LAYER, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", AMENITIES_LAYER, () => {
          map.getCanvas().style.cursor = "";
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
    };

    const defaultCoordinates = { latitude: 45.4642, longitude: 9.19 };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        e => positionCallback(e.coords),
        () => positionCallback(defaultCoordinates)
      );
    } else {
      positionCallback(defaultCoordinates);
    }

    return () => {
      aborted = true;
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

  // Update layer filter when filters change
  useEffect(() => {
    updateLayerFilter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // --- Render ---

  const filterCheckboxes = amenities.map(amenity => (
    <Checkbox
      key={amenity}
      value={filters[amenity]}
      label={getAmenityTitle(amenity)}
      onChange={show => setFilter(amenity, show)}
    />
  ));

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

      {openedNode && <BottomSheet />}

      {showSearchThisAreaButton && openedNode === null && (
        <div
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
        </div>
      )}

      {upsertNode && mapRef.current && (
        <UpsertNodePopup
          map={mapRef.current}
          onDone={(
            node: OpenStreetMapNode,
            action: "create" | "update" | "delete"
          ) => {
            if (action === "delete") {
              delete nodesRef.current[node.id];
            } else {
              nodesRef.current[node.id] = node;
              updateCachedItems([node]);
            }

            updateGeoJsonSource();
            setUpsertNode(null);
          }}
        />
      )}

      <div
        className="menu-button"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          ...(openedNode ? { zIndex: 2 } : {})
        }}
        onClick={() => setIsMenuOpen(true)}
      >
        <MenuIcon />

        {/* popup */}
        <Popup
          onClose={() => {
            setIsMenuOpen(false);
          }}
          isOpen={isMenuOpen}
        >
          <h4>Search options</h4>

          <span style={{ marginTop: 16, marginBottom: 8 }}>
            Around radius: <b>{around} meters</b>
          </span>
          <input
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

          <div style={{ height: 24 }} />

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

          <div className="separator" />

          <h4 style={{ marginBottom: 8 }}>Filters</h4>
          {filterCheckboxes}

          <div className="separator" />

          <h4>Add new amenity (OSM account required)</h4>
          {amenities.map((amenity, i) => (
            <Button
              key={amenity}
              label={`Add ${getAmenityTitle(amenity)}`}
              style={{ marginTop: i === 0 ? 16 : 24 }}
              onClick={() => {
                setIsMenuOpen(false);
                setUpsertNode({
                  type: "create_without_coordinates",
                  node: {
                    tags: { amenity }
                  }
                });
              }}
            />
          ))}
        </Popup>
      </div>

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

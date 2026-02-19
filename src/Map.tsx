import * as React from "react";
import debounce from "lodash/debounce";
import View from "react-flexview";
import { Option, none, some, map, isSome } from "fp-ts/lib/Option";
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
import * as MapboxCircle from "mapbox-gl-circle";
import LoadingBar, { LoadingBarRef } from "react-top-loading-bar";
import { Popup } from "./Popup";
import { UpsertNode, UpsertNodePopup } from "./UpsertNode";
import { Button, Checkbox } from "./form";
import BottomSheet from "./BottomSheet";
import {
  registerMapIcons,
  getIconName,
  AMENITIES_SOURCE,
  AMENITIES_LAYER
} from "./mapIcons";

import Toast from "./Toast";

import "./map.scss";

const mapboxgl = window.mapboxgl;

type State = {
  openedNode: null | OpenStreetMapNode;
  upsertNode: null | UpsertNode;
  isMenuOpen: boolean;
  around: number;
  filters: {
    [k in Amenity]: boolean;
  };
  showRadius: boolean;
  continousSearch: boolean;
  showSearchThisAreaButton: boolean;
  errorMessage: string | null;
};

const amenitiesMapOrder: { [k in Amenity]: number } = {
  drinking_water: 1,
  shower: 2,
  toilets: 3,
  public_bath: 4,
  device_charging_station: 5,
  bicycle_repair_station: 6
};

class MapFountains extends React.PureComponent<{}, State> {
  state: State = {
    openedNode: null,
    upsertNode: null,
    isMenuOpen: false,
    around: 0,
    showRadius: false,
    filters: {
      drinking_water: true,
      toilets: true,
      shower: true,
      bicycle_repair_station: true,
      public_bath: true,
      device_charging_station: true
    },
    continousSearch: false,
    showSearchThisAreaButton: false,
    errorMessage: null
  };

  map: Option<mapboxgl.Map> = none;

  circleRadius: any | null = null;

  nodes: {
    [id: string]: OpenStreetMapNode;
  } = {};

  loadingBarRef = React.createRef<LoadingBarRef>();

  previousCenter: { lng: number; lat: number } = { lng: 0, lat: 0 };

  getMap(cb: (map: mapboxgl.Map) => void) {
    map<mapboxgl.Map, void>(cb)(this.map);
  }

  updateGeoJsonSource = () => {
    this.getMap(map => {
      const source = map.getSource(AMENITIES_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!source) return;

      const features: GeoJSON.Feature[] = Object.values(this.nodes).map(
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
  };

  updateLayerFilter = () => {
    this.getMap(map => {
      const enabledAmenities = amenities.filter(a => this.state.filters[a]);

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
  };

  updateCachedAmenities = () => {
    this.getMap(map => {
      const center = map.getCenter();

      localforage.getItem<OpenStreetMapNode[]>("amenities").then(items => {
        if (items) {
          const nodesInRadius = items.filter(node => {
            const distanceInMeters = distance(
              [center.lng, center.lat],
              [node.lon, node.lat],
              {
                units: "meters"
              }
            );

            return distanceInMeters < this.state.around;
          });

          // add cached nodes contained in the circle radius
          this.addAmenitiesMarkers(nodesInRadius);
        }
      });
    });
  };

  updateAmenities = () => {
    this.getMap(map => {
      this.updateCachedAmenities();

      if (this.loadingBarRef.current) {
        // @ts-ignore (continuousStart args are optional)
        this.loadingBarRef.current.continuousStart();
      }

      getOpenStreetMapAmenities({
        around: this.state.around,
        lat: map.getCenter().lat,
        lng: map.getCenter().lng
      })
        .then(this.addAmenitiesMarkers)
        .catch(() => {
          this.setState({
            errorMessage: "Failed to load amenities. Please try again."
          });
        })
        .finally(() => {
          if (this.loadingBarRef.current) {
            this.loadingBarRef.current.complete();
          }
        });
    });
  };

  updateAmenitiesDebounce = debounce(() => {
    this.getMap(map => {
      if (this.previousCenter.lat === 0 && this.previousCenter.lng === 0) {
        this.previousCenter = map.getCenter();
        return;
      }

      const distanceInMeters = distance(
        [map.getCenter().lat, map.getCenter().lng],
        [this.previousCenter.lat, this.previousCenter.lng],
        {
          units: "meters"
        }
      );

      if (distanceInMeters > this.state.around / 2) {
        if (this.state.continousSearch) {
          this.previousCenter = map.getCenter();
          this.updateAmenities();
        } else {
          this.setState({ showSearchThisAreaButton: true });
        }
      } else {
        this.setState({ showSearchThisAreaButton: false });
      }
    });
  }, 1000);

  initializeMap() {
    mapboxgl.accessToken =
      "pk.eyJ1IjoiZnJhbmNlc2NvY2lvcmlhIiwiYSI6ImNqcThyejR6ODA2ZDk0M25rZzZjcGo4ZmcifQ.yRWHQbG1dJjDp43d01bBOw";

    const positionCallback = (coords: {
      latitude: number;
      longitude: number;
    }) => {
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
        this.map = some(map);

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
            const node = this.nodes[feature.properties.id];
            if (node) {
              this.setState({ openedNode: node });
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

        this.updateAmenities();

        (
          document.querySelector(".mapboxgl-ctrl-geolocate") as HTMLElement
        )?.click();
      });

      map.on("move", () => {
        this.updateAmenitiesDebounce();

        requestAnimationFrame(() => {
          if (this.state.showRadius) {
            this.showRadius();
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
  }

  addAmenitiesMarkers = (nodes: OpenStreetMapNode[]) => {
    let changed = false;
    nodes.forEach(node => {
      if (!this.nodes[node.id]) {
        this.nodes[node.id] = node;
        changed = true;
      }
    });

    if (changed) {
      this.updateGeoJsonSource();
    }
  };

  showRadius() {
    this.getMap(map => {
      const center = {
        lat: map.getCenter().lat,
        lng: map.getCenter().lng
      };

      if (this.circleRadius) {
        this.circleRadius.setCenter(center);

        this.circleRadius.setRadius(this.state.around);
      } else {
        this.circleRadius = new MapboxCircle(center, this.state.around, {
          editable: false,
          minRadius: 0,
          fillColor: "transparent"
        }).addTo(map);
      }
    });
  }

  hideRadius() {
    this.circleRadius.remove();
    this.circleRadius = null;
  }

  componentDidMount() {
    // initialize "around" radius
    localforage
      .getItem<number>("around")
      .then(around => this.setState({ around: around || 1000 }));

    // initialize "showRadius" option
    localforage.getItem<boolean>("showRadius").then(showRadius => {
      this.setState({ showRadius: showRadius === null ? true : showRadius });

      if (showRadius) {
        this.showRadius();
      }
    });

    // initialize "continousSearch" option
    localforage
      .getItem<boolean>("continousSearch")
      .then(continousSearch =>
        this.setState({ continousSearch: continousSearch || false })
      );

    // initialize map
    this.initializeMap();
  }

  componentDidUpdate() {
    requestAnimationFrame(() => {
      this.getMap(map => map.resize());
    });
  }

  updateFilter(amenity: Amenity, value: boolean) {
    this.setState({
      filters: {
        ...this.state.filters,
        [amenity]: value
      }
    });
  }

  render() {
    const filters = amenities.map(
      (amenity): JSX.Element => (
        <Checkbox
          key={amenity}
          value={this.state.filters[amenity]}
          label={getAmenityTitle(amenity)}
          onChange={show => {
            this.updateFilter(amenity, show);

            setTimeout(() => this.updateLayerFilter());
          }}
        />
      )
    );

    return (
      <View style={{ height: "100%", width: "100%" }} column>
        <View>
          <LoadingBar ref={this.loadingBarRef} color="lightgreen" height={8} />
        </View>

        <View grow id="map" />

        {this.state.openedNode && (
          <BottomSheet
            node={this.state.openedNode}
            onDismiss={() => this.setState({ openedNode: null })}
            onEditNode={node =>
              this.setState({
                upsertNode: { type: "update", node }
              })
            }
          />
        )}

        {this.state.showSearchThisAreaButton &&
          this.state.openedNode === null && (
            <View
              className="search-this-area-button"
              vAlignContent="center"
              hAlignContent="center"
              onClick={() => {
                this.getMap(map => {
                  this.previousCenter = map.getCenter();
                  this.updateAmenities();

                  this.setState({ showSearchThisAreaButton: false });
                });
              }}
            >
              Search this area
            </View>
          )}

        {this.state.upsertNode && isSome(this.map) && (
          <UpsertNodePopup
            map={this.map.value}
            onClose={() => {
              this.setState({ upsertNode: null });
            }}
            onDone={(
              node: OpenStreetMapNode,
              action: "create" | "update" | "delete"
            ) => {
              if (action === "delete") {
                delete this.nodes[node.id];
              } else {
                this.nodes[node.id] = node;
                updateCachedItems([node]);
              }

              this.updateGeoJsonSource();
              this.setState({ upsertNode: null });
            }}
            {...this.state.upsertNode}
          />
        )}

        <View
          className="menu-button"
          hAlignContent="center"
          vAlignContent="center"
          style={this.state.openedNode ? { zIndex: 2 } : undefined}
          onClick={() => this.setState({ isMenuOpen: true })}
        >
          <MenuIcon />

          {/* popup */}
          <Popup
            onClose={() => {
              this.setState({ isMenuOpen: false });
            }}
            isOpen={this.state.isMenuOpen}
          >
            <h4>Search options</h4>

            <span style={{ marginTop: 16, marginBottom: 8 }}>
              Around radius: <b>{this.state.around} meters</b>
            </span>
            <input
              value={this.state.around}
              type="range"
              min="500"
              max="15000"
              step="500"
              onChange={e => {
                const around = parseInt(e.currentTarget.value) || 1000;

                this.setState({ around }, () => {
                  if (this.state.showRadius) {
                    this.showRadius();
                  }
                });

                localforage.setItem("around", around);
              }}
            />

            <View height={24} />

            <Checkbox
              value={this.state.showRadius}
              label="Show radius in map"
              onChange={showRadius => {
                this.setState({ showRadius });
                localforage.setItem("showRadius", showRadius);

                if (showRadius) {
                  this.showRadius();
                } else {
                  this.hideRadius();
                }
              }}
            />

            <Checkbox
              value={this.state.continousSearch}
              label="Enable continous search"
              onChange={continousSearch => {
                this.setState({
                  continousSearch,
                  showSearchThisAreaButton: false
                });
                localforage.setItem("continousSearch", continousSearch);
              }}
            />

            <View className="separator" />

            <h4 style={{ marginBottom: 8 }}>Filters</h4>
            {filters}

            <View className="separator" />

            <h4>Add new amenity (OSM account required)</h4>
            {amenities.map((amenity, i) => (
              <Button
                key={amenity}
                label={`Add ${getAmenityTitle(amenity)}`}
                style={{ marginTop: i === 0 ? 16 : 24 }}
                onClick={() => {
                  this.setState({
                    isMenuOpen: false,
                    upsertNode: {
                      type: "create_without_coordinates",
                      node: {
                        tags: { amenity }
                      }
                    }
                  });
                }}
              />
            ))}
          </Popup>
        </View>

        {this.state.errorMessage && (
          <Toast
            message={this.state.errorMessage}
            onDismiss={() => this.setState({ errorMessage: null })}
          />
        )}
      </View>
    );
  }
}

export default MapFountains;

import * as React from "react";
import * as ReactDOM from "react-dom";
import debounce from "lodash/debounce";
import View from "react-flexview";
import { Option, none, some, map, isSome } from "fp-ts/lib/Option";
import getOpenStreetMapAmenities, {
  OpenStreetMapNode
} from "./getOpenStreetMapAmenities";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import PublicToiletsMarker from "./PublicToiletsMarker";
import PublicShowerMarker from "./PublicShowerMarker";
import distance from "@turf/distance";
import localforage from "localforage";
import MenuIcon from "./MenuIcon";
import * as MapboxCircle from "mapbox-gl-circle";
import LoadingBar, { LoadingBarRef } from "react-top-loading-bar";
import { Popup } from "./Popup";
import { UpsertNodePopup } from "./UpsertNode";

import "./map.scss";

const Checkbox = (props: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) => (
  <View
    className="checkbox"
    vAlignContent="center"
    onClick={() => props.onChange(!props.value)}
    shrink={false}
  >
    <input
      checked={props.value}
      type="checkbox"
      onChange={e => {
        props.onChange(e.currentTarget.checked);
      }}
    />
    <span className="checkbox-label">{props.label}</span>
  </View>
);

const mapboxgl = window.mapboxgl;

type State = {
  upsertNode: null | (Omit<OpenStreetMapNode, "id"> & { id: number | null });
  isMenuOpen: boolean;
  around: number;
  showRadius: boolean;
  showDrinkingWater: boolean;
  showToilets: boolean;
  showShowers: boolean;
  continousSearch: boolean;
  showSearchThisAreaButton: boolean;
};

class MapFountains extends React.PureComponent<{}, State> {
  state: State = {
    upsertNode: null,
    isMenuOpen: false,
    around: 0,
    showRadius: false,
    showDrinkingWater: true,
    showShowers: true,
    showToilets: true,
    continousSearch: false,
    showSearchThisAreaButton: false
  };

  map: Option<mapboxgl.Map> = none;

  circleRadius: any | null = null;

  drinkingWaterNodes: {
    [id: string]: OpenStreetMapNode;
  } = {};

  drinkingWaterMarkers: mapboxgl.Marker[] = [];

  publicToiletsNodes: {
    [id: string]: OpenStreetMapNode;
  } = {};

  publicToiletsMarkers: mapboxgl.Marker[] = [];

  publicShowersNodes: {
    [id: string]: OpenStreetMapNode;
  } = {};

  publicShowersMarkers: mapboxgl.Marker[] = [];

  loadingBarRef = React.createRef<LoadingBarRef>();

  previousCenter: { lng: number; lat: number } = { lng: 0, lat: 0 };

  updateCachedAmenities = () => {
    map<mapboxgl.Map, void>(map => {
      localforage.getItem<OpenStreetMapNode[]>("amenities").then(items => {
        if (items) {
          this.addAmenitiesMarkers(
            // add cached nodes contained in the circle radius
            items.filter(node => {
              const distanceInMeters = distance(
                [map.getCenter().lat, map.getCenter().lng],
                [node.lat, node.lon],
                {
                  units: "meters"
                }
              );

              return distanceInMeters < this.state.around;
            })
          );
        }
      });
    });
  };

  updateAmenities = () => {
    map<mapboxgl.Map, void>(map => {
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
        .then(() => {
          if (this.loadingBarRef.current) {
            this.loadingBarRef.current.complete();
          }
        });
    })(this.map);
  };

  updateAmenitiesDebounce = debounce(() => {
    map<mapboxgl.Map, void>(map => {
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
    })(this.map);
  }, 1000);

  initializeMap() {
    mapboxgl.accessToken =
      "pk.eyJ1IjoiZnJhbmNlc2NvY2lvcmlhIiwiYSI6ImNqcThyejR6ODA2ZDk0M25rZzZjcGo4ZmcifQ.yRWHQbG1dJjDp43d01bBOw";

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(e => {
        const map = new mapboxgl.Map({
          container: "map",
          style:
            "mapbox://styles/francescocioria/cjqi3u6lmame92rmw6aw3uyhm?optimize=true",
          center: {
            lat: e.coords.latitude,
            lng: e.coords.longitude
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

        map.on("load", () => {
          this.map = some(map);

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
      });
    }
  }

  addMarkers = (
    nodes: OpenStreetMapNode[],
    cacheMap: { [k: string]: OpenStreetMapNode },
    markerElement: (node: OpenStreetMapNode) => JSX.Element,
    cachedMarkers: mapboxgl.Marker[],
    show: boolean
  ) => {
    map<mapboxgl.Map, void>(map => {
      nodes.forEach(node => {
        if (!cacheMap[node.id]) {
          const element = document.createElement("div");
          ReactDOM.render(markerElement(node), element);

          const marker: mapboxgl.Marker = new mapboxgl.Marker({
            element
          }).setLngLat([node.lon, node.lat]);

          const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<div style="overflow-wrap: break-word;">
                ${Object.keys(node.tags)
                  .map(k => `<b>${k}:</b> ${node.tags[k as never]}`)
                  .join("<br />")}

                ${
                  node.tags.mapillary
                    ? `<button style="margin-top: 16px;">
                        <a href="${node.tags.mapillary}" target="_blank" rel="noopener noreferrer">
                          See street view
                        </a>
                      </button>`
                    : ""
                }

                <div>
                  <button style="margin-top: 16px;">
                    <a href="https://www.google.com/maps/dir//${node.lat},${
              node.lon
            }" target="_blank" rel="noopener noreferrer">
                      Directions
                    </a>
                  </button>
                </div>

                <div>
                  <button style="margin-top: 16px;" onclick="editNode('${
                    node.id
                  }')">
                    Edit node
                  </button>
                </div>
              </div>
              `

            // <a href="https://www.openstreetmap.org/edit?node=${
            // node.id
            // }" target="_blank" rel="noopener noreferrer">
            // Edit node
            // </a>
          );

          marker.setPopup(popup);

          if (show) {
            marker.addTo(map);
          }

          cacheMap[node.id] = node;

          cachedMarkers.push(marker);
        }
      });
    })(this.map);
  };

  color(tags: OpenStreetMapNode["tags"]): string {
    if (
      "access" in tags &&
      tags.access &&
      !["yes", "public", "unknown", "permissive"].includes(tags.access)
    ) {
      return "#d0d0d0";
    } else if (
      "fee" in tags &&
      typeof tags.fee === "string" &&
      tags.fee !== "no"
    ) {
      return "gold";
    }

    return "white";
  }

  addAmenitiesMarkers = (nodes: OpenStreetMapNode[]) => {
    // public showers
    this.addMarkers(
      nodes.filter(node => node.tags.amenity === "shower"),
      this.publicShowersNodes,
      (node: OpenStreetMapNode) => (
        <PublicShowerMarker color={this.color(node.tags)} />
      ),
      this.publicShowersMarkers,
      this.state.showShowers
    );

    // drinking_water
    this.addMarkers(
      nodes.filter(node => node.tags.amenity === "drinking_water"),
      this.drinkingWaterNodes,
      () => <DrinkingWaterMarker />,
      this.drinkingWaterMarkers,
      this.state.showDrinkingWater
    );

    // toilets
    this.addMarkers(
      nodes.filter(node => node.tags.amenity === "toilets"),
      this.publicToiletsNodes,
      (node: OpenStreetMapNode) => (
        <PublicToiletsMarker color={this.color(node.tags)} />
      ),
      this.publicToiletsMarkers,
      this.state.showToilets
    );
  };

  showRadius() {
    map<mapboxgl.Map, void>(map => {
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
    })(this.map);
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

    // edit node cb
    (window as any).editNode = (nodeId: string) => {
      localforage.getItem<OpenStreetMapNode[]>("amenities").then(items => {
        const node = items?.find(i => String(i.id) === nodeId);

        this.setState({
          upsertNode: (node || null) as any
        });
      });
    };
  }

  componentDidUpdate() {
    requestAnimationFrame(() => {
      map<mapboxgl.Map, void>(map => map.resize())(this.map);
    });
  }

  render() {
    return (
      <View style={{ height: "100%", width: "100%" }} column>
        <View>
          <LoadingBar ref={this.loadingBarRef} color="lightgreen" height={8} />
        </View>

        <View grow id="map" />

        {this.state.showSearchThisAreaButton && (
          <View
            className="search-this-area-button"
            vAlignContent="center"
            hAlignContent="center"
            onClick={() => {
              map<mapboxgl.Map, void>(map => {
                this.previousCenter = map.getCenter();
                this.updateAmenities();

                this.setState({ showSearchThisAreaButton: false });
              })(this.map);
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
            onDone={() => {
              this.setState({ upsertNode: null });
              this.updateCachedAmenities();
            }}
            node={this.state.upsertNode}
          />
        )}

        <View
          className="menu-button"
          hAlignContent="center"
          vAlignContent="center"
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
            <span className="menu-item-label">
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

                this.setState({ around });
                localforage.setItem("around", around);
              }}
            />

            <View height={24} />

            <View className="separator" />

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

            <View className="separator" />

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

            <Checkbox
              value={this.state.showDrinkingWater}
              label='Show "drinking water"'
              onChange={showDrinkingWater => {
                this.setState({ showDrinkingWater });

                map<mapboxgl.Map, void>(map => {
                  if (showDrinkingWater) {
                    this.drinkingWaterMarkers.forEach(marker =>
                      marker.addTo(map)
                    );
                  } else {
                    this.drinkingWaterMarkers.forEach(marker =>
                      marker.remove()
                    );
                  }
                })(this.map);
              }}
            />

            <Checkbox
              value={this.state.showToilets}
              label='Show "toilets"'
              onChange={showToilets => {
                this.setState({ showToilets });

                map<mapboxgl.Map, void>(map => {
                  if (showToilets) {
                    this.publicToiletsMarkers.forEach(marker =>
                      marker.addTo(map)
                    );
                  } else {
                    this.publicToiletsMarkers.forEach(marker =>
                      marker.remove()
                    );
                  }
                })(this.map);
              }}
            />

            <Checkbox
              value={this.state.showShowers}
              label='Show "showers"'
              onChange={showShowers => {
                this.setState({ showShowers });

                map<mapboxgl.Map, void>(map => {
                  if (showShowers) {
                    this.publicShowersMarkers.forEach(marker =>
                      marker.addTo(map)
                    );
                  } else {
                    this.publicShowersMarkers.forEach(marker =>
                      marker.remove()
                    );
                  }
                })(this.map);
              }}
            />

            <View className="separator" />

            <button
              style={{ marginTop: 16, cursor: "pointer", flexShrink: 0 }}
              onClick={() => {
                this.setState({
                  isMenuOpen: false,
                  upsertNode: {
                    id: null,
                    lat: 0,
                    lon: 0,
                    tags: { amenity: "drinking_water" }
                  }
                });
              }}
            >
              Add drinking fountain
            </button>

            <button
              style={{ marginTop: 24, cursor: "pointer", flexShrink: 0 }}
              onClick={() => {
                this.setState({
                  isMenuOpen: false,
                  upsertNode: {
                    id: null,
                    lat: 0,
                    lon: 0,
                    tags: { amenity: "toilets" }
                  }
                });
              }}
            >
              Add toilets
            </button>

            <button
              style={{ marginTop: 24, cursor: "pointer", flexShrink: 0 }}
              onClick={() => {
                this.setState({
                  isMenuOpen: false,
                  upsertNode: {
                    id: null,
                    lat: 0,
                    lon: 0,
                    tags: { amenity: "shower" }
                  }
                });
              }}
            >
              Add shower
            </button>
          </Popup>
        </View>
      </View>
    );
  }
}

export default MapFountains;

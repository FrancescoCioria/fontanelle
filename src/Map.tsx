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

import "./map.scss";
import roundGeoCoordinate from "./roundGeoCoordinate";

const mapboxgl = window.mapboxgl;

type State = {
  isMenuOpen: boolean;
  around: number;
  showRadius: boolean;
  showDrinkingWater: boolean;
  showToilets: boolean;
  showShowers: boolean;
};

class MapFountains extends React.PureComponent<{}, State> {
  state: State = {
    isMenuOpen: false,
    around: 0,
    showRadius: false,
    showDrinkingWater: true,
    showShowers: true,
    showToilets: true
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

  updateAmenities = () => {
    map<mapboxgl.Map, void>(map => {
      localforage.getItem<OpenStreetMapNode[]>("amenities").then(items => {
        if (items) {
          this.addAmenitiesMarkers(items);
        }
      });

      getOpenStreetMapAmenities({
        around: this.state.around,
        lat: map.getCenter().lat,
        lng: map.getCenter().lng
      }).then(this.addAmenitiesMarkers);
    })(this.map);
  };

  updateAmenitiesDebounce = debounce(() => {
    this.updateAmenities();
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

          if (this.state.showRadius) {
            this.showRadius();
          }
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
      nodes
        .filter(node => {
          const distanceInMeters = distance(
            [map.getCenter().lat, map.getCenter().lng],
            [node.lat, node.lon],
            {
              units: "meters"
            }
          );

          return distanceInMeters < this.state.around * 1.3;
        })
        .forEach(node => {
          if (!cacheMap[node.id]) {
            const element = document.createElement("div");
            ReactDOM.render(markerElement(node), element);

            const marker: mapboxgl.Marker = new mapboxgl.Marker({
              element
            }).setLngLat([node.lon, node.lat]);

            const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<div style="overflow-wrap: break-word;">
                ${Object.keys(node.tags)
                  .map(k => `<b>${k}:</b> ${node.tags[k]}`)
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
                    <a href="https://www.openstreetmap.org/edit?node=${
                      node.id
                    }" target="_blank" rel="noopener noreferrer">
                      Edit node
                    </a>
                  </button>
                </div>
              </div>
              `
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

  addAmenitiesMarkers = (nodes: OpenStreetMapNode[]) => {
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
        <PublicToiletsMarker
          color={
            typeof node.tags.fee === "string" && node.tags.fee !== "no"
              ? "gold"
              : "white"
          }
        />
      ),
      this.publicToiletsMarkers,
      this.state.showToilets
    );

    // public showers
    this.addMarkers(
      nodes.filter(node => node.tags.amenity === "shower"),
      this.publicShowersNodes,
      () => <PublicShowerMarker />,
      this.publicShowersMarkers,
      this.state.showShowers
    );
  };

  showRadius() {
    map<mapboxgl.Map, void>(map => {
      const center = {
        lat: roundGeoCoordinate(map.getCenter().lat),
        lng: roundGeoCoordinate(map.getCenter().lng)
      };

      if (this.circleRadius) {
        this.circleRadius.setCenter(center);

        this.circleRadius.setRadius(this.state.around);
      } else {
        this.circleRadius = new MapboxCircle(center, this.state.around, {
          editable: false,
          minRadius: 0,
          fillColor: "#29AB87"
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

    // initialize map
    this.initializeMap();
  }

  componentDidUpdate() {
    requestAnimationFrame(() => {
      map<mapboxgl.Map, void>(map => map.resize())(this.map);
    });
  }

  render() {
    return (
      <View style={{ height: "100%", width: "100%" }} column>
        <View grow id="map" />

        <View
          style={{
            position: "absolute",
            top: 30,
            right: 8,
            zIndex: 9999999,
            background: "white",
            borderRadius: 4,
            width: 30,
            height: 30,
            border: "2px solid #969492",
            cursor: "pointer"
          }}
          hAlignContent="center"
          vAlignContent="center"
        >
          <View onClick={() => this.setState({ isMenuOpen: true })}>
            <MenuIcon />
          </View>

          {/* popup */}
          <View
            className="menu-popup"
            style={{
              display: this.state.isMenuOpen ? "flex" : "none"
            }}
            hAlignContent="center"
            vAlignContent="center"
            onClick={() => this.setState({ isMenuOpen: false })}
          >
            <View
              className="menu-popup-content"
              vAlignContent="center"
              column
              onClick={e => {
                e.stopPropagation();
              }}
            >
              <span className="menu-item-label">Around radius (in meters)</span>
              <input
                value={this.state.around}
                type="number"
                onChange={e => {
                  const around = parseInt(e.currentTarget.value) || 1000;

                  this.setState({ around });
                  localforage.setItem("around", around);
                }}
              />

              <View className="checkbox" vAlignContent="center">
                <input
                  checked={this.state.showRadius}
                  type="checkbox"
                  onChange={e => {
                    const showRadius = e.currentTarget.checked;

                    this.setState({ showRadius });
                    localforage.setItem("showRadius", showRadius);

                    if (showRadius) {
                      this.showRadius();
                    } else {
                      this.hideRadius();
                    }
                  }}
                />
                <span className="menu-item-label">Show radius in map</span>
              </View>

              <View className="checkbox" vAlignContent="center">
                <input
                  checked={this.state.showDrinkingWater}
                  type="checkbox"
                  onChange={e => {
                    const showDrinkingWater = e.currentTarget.checked;
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
                <span className="menu-item-label">Show "drinking water"</span>
              </View>

              <View className="checkbox" vAlignContent="center">
                <input
                  checked={this.state.showToilets}
                  type="checkbox"
                  onChange={e => {
                    const showToilets = e.currentTarget.checked;
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
                <span className="menu-item-label">Show "toilets"</span>
              </View>

              <View className="checkbox" vAlignContent="center">
                <input
                  checked={this.state.showShowers}
                  type="checkbox"
                  onChange={e => {
                    const showShowers = e.currentTarget.checked;
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
                <span className="menu-item-label">Show "showers"</span>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }
}

export default MapFountains;

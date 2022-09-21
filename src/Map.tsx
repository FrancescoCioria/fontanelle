import * as React from "react";
import * as ReactDOM from "react-dom";
import debounce from "lodash/debounce";
import View from "react-flexview";
import { Option, none, some, map, isSome } from "fp-ts/lib/Option";
import getOpenStreetMapAmenities, {
  OpenStreetMapNode,
  updateCachedItems,
  getAmenityMarker,
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
      public_bath: true
    },
    continousSearch: false,
    showSearchThisAreaButton: false
  };

  map: Option<mapboxgl.Map> = none;

  circleRadius: any | null = null;

  nodes: {
    [id: string]: {
      node: OpenStreetMapNode;
      marker: mapboxgl.Marker;
    };
  } = {};

  loadingBarRef = React.createRef<LoadingBarRef>();

  previousCenter: { lng: number; lat: number } = { lng: 0, lat: 0 };

  updateCachedAmenities = () => {
    map<mapboxgl.Map, void>(map => {
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
    })(this.map);
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
        .finally(() => {
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

  addAmenitiesMarkers = (nodes: OpenStreetMapNode[]) => {
    map<mapboxgl.Map, void>(map => {
      nodes.forEach(node => {
        if (!this.nodes[node.id]) {
          const element = document.createElement("div");

          ReactDOM.render(
            <div
              onClick={() => {
                this.setState({ openedNode: node });
              }}
            >
              {getAmenityMarker(node.tags, 20)}
            </div>,
            element
          );

          const marker: mapboxgl.Marker = new mapboxgl.Marker({
            element
          }).setLngLat([node.lon, node.lat]);

          if (this.state.filters[node.tags.amenity]) {
            marker.addTo(map);
          }

          this.nodes[node.id] = {
            node,
            marker
          };
        }
      });
    })(this.map);
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
  }

  componentDidUpdate() {
    requestAnimationFrame(() => {
      map<mapboxgl.Map, void>(map => map.resize())(this.map);
    });
  }

  amenityNodes(amenity: Amenity) {
    return Object.values(this.nodes).filter(
      v => v.node.tags.amenity === amenity
    );
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

            map<mapboxgl.Map, void>(map => {
              if (show) {
                this.amenityNodes(amenity).forEach(v => v.marker.addTo(map));
              } else {
                this.amenityNodes(amenity).forEach(v => v.marker.remove());
              }
            })(this.map);
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

        {this.state.showSearchThisAreaButton && this.state.openedNode === null && (
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
            onDone={(node: OpenStreetMapNode) => {
              if (this.nodes[node.id]) {
                // remove marker
                this.nodes[node.id].marker.remove();

                // delete node from cache
                delete this.nodes[node.id];
              }

              // show updated/created node
              this.addAmenitiesMarkers([node]);

              // fire&forget
              updateCachedItems([node]);

              this.setState({ upsertNode: null });
            }}
            {...this.state.upsertNode}
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
      </View>
    );
  }
}

export default MapFountains;

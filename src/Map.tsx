import * as React from "react";
import * as ReactDOM from "react-dom";
import debounce from "lodash/debounce";
import View from "react-flexview";
import { Option, none, some, map } from "fp-ts/lib/Option";
import { OpenStreetMapNode } from "./getOpenStreetMapAmenity";
import getDrinkingWater from "./getDrinkingWater";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import getPublicToilets from "./getPublicToilets";
import PublicToiletsMarker from "./PublicToiletsMarker";
import distance from "@turf/distance";
import localforage from "localforage";

import "./map.scss";

const mapboxgl = window.mapboxgl;

class MapFountains extends React.PureComponent<{}> {
  map: Option<mapboxgl.Map> = none;

  drinkingWaterNodes: {
    [id: string]: OpenStreetMapNode;
  } = {};

  drinkingWaterMarkers: mapboxgl.Marker[] = [];

  publicToiletsNodes: {
    [id: string]: OpenStreetMapNode;
  } = {};

  publicToiletsMarkers: mapboxgl.Marker[] = [];

  updateDrinkingWater = () => {
    map<mapboxgl.Map, void>(map => {
      localforage.getItem<OpenStreetMapNode[]>("drinking_water").then(items => {
        if (items) {
          this.addWaterMarkers(items);
        }
      });

      getDrinkingWater({
        around: 1000,
        lat: map.getCenter().lat,
        lng: map.getCenter().lng
      }).then(this.addWaterMarkers);
    })(this.map);
  };

  updateDrinkingWaterDebounce = debounce(() => {
    this.updateDrinkingWater();
  }, 1000);

  updatePublicToilets = () => {
    map<mapboxgl.Map, void>(map => {
      localforage.getItem<OpenStreetMapNode[]>("toilets").then(items => {
        if (items) {
          this.addPublicToiletsMarkers(items);
        }
      });

      getPublicToilets({
        around: 1000,
        lat: map.getCenter().lat,
        lng: map.getCenter().lng
      }).then(this.addPublicToiletsMarkers);
    })(this.map);
  };

  updatePublicToiletsDebounce = debounce(() => {
    this.updatePublicToilets();
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
          scrollZoom: false
        });

        map.addControl(
          new mapboxgl.GeolocateControl({
            positionOptions: {
              enableHighAccuracy: true
            },
            trackUserLocation: true
          })
        );

        map.addControl(new mapboxgl.ScaleControl());

        map.on("load", () => {
          this.map = some(map);

          this.updateDrinkingWater();
          this.updatePublicToilets();

          (
            document.querySelector(".mapboxgl-ctrl-geolocate") as HTMLElement
          )?.click();
        });

        map.on("move", () => {
          this.updateDrinkingWaterDebounce();
          this.updatePublicToiletsDebounce();
        });
      });
    }
  }

  addMarkers = (
    nodes: OpenStreetMapNode[],
    cacheMap: { [k: string]: OpenStreetMapNode },
    markerElement: JSX.Element,
    cachedMarkers: mapboxgl.Marker[]
  ) => {
    map<mapboxgl.Map, void>(map => {
      const lat = map.getCenter().lat;
      const lng = map.getCenter().lng;

      nodes
        .filter(node => {
          const distanceInKm = distance([lat, lng], [node.lat, node.lon], {
            units: "kilometers"
          });

          return distanceInKm < 2;
        })
        .forEach(node => {
          if (!cacheMap[node.id]) {
            const element = document.createElement("div");
            ReactDOM.render(markerElement, element);

            const marker: mapboxgl.Marker = new mapboxgl.Marker({
              element
            }).setLngLat([node.lon, node.lat]);

            marker.addTo(map);

            cacheMap[node.id] = node;

            cachedMarkers.push(marker);
          }
        });
    })(this.map);
  };

  addWaterMarkers = (drinkingWaterNodes: OpenStreetMapNode[]) => {
    this.addMarkers(
      drinkingWaterNodes,
      this.drinkingWaterNodes,
      <DrinkingWaterMarker />,
      this.drinkingWaterMarkers
    );
  };

  addPublicToiletsMarkers = (publicToiletsNodes: OpenStreetMapNode[]) => {
    this.addMarkers(
      publicToiletsNodes,
      this.publicToiletsNodes,
      <PublicToiletsMarker />,
      this.publicToiletsMarkers
    );
  };

  componentDidMount() {
    this.initializeMap();
  }

  componentDidUpdate() {
    requestAnimationFrame(() => {
      map<mapboxgl.Map, void>(map => map.resize())(this.map);
    });
  }

  render() {
    return <View grow id="map" />;
  }
}

export default MapFountains;

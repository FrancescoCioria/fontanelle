import * as React from "react";
import * as ReactDOM from "react-dom";
import debounce from "lodash/debounce";
import View from "react-flexview";
import { Option, none, some, map } from "fp-ts/lib/Option";
import getOpenStreetMapAmenities, {
  OpenStreetMapNode
} from "./getOpenStreetMapAmenities";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import PublicToiletsMarker from "./PublicToiletsMarker";
import PublicShowerMarker from "./PublicShowerMarker";
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
        around: 1000,
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

          this.updateAmenities();

          (
            document.querySelector(".mapboxgl-ctrl-geolocate") as HTMLElement
          )?.click();
        });

        map.on("move", () => {
          this.updateAmenitiesDebounce();
        });
      });
    }
  }

  addMarkers = (
    nodes: OpenStreetMapNode[],
    cacheMap: { [k: string]: OpenStreetMapNode },
    markerElement: (node: OpenStreetMapNode) => JSX.Element,
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
              </div>
              `
            );

            marker.setPopup(popup);

            marker.addTo(map);

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
      this.drinkingWaterMarkers
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
      this.publicToiletsMarkers
    );

    // public showers
    this.addMarkers(
      nodes.filter(node => node.tags.amenity === "shower"),
      this.publicShowersNodes,
      (node: OpenStreetMapNode) => <PublicShowerMarker />,
      this.publicShowersMarkers
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

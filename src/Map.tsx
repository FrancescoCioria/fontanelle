import * as React from "react";
import * as ReactDOM from "react-dom";
import throttle from "lodash/throttle";
import mapboxgl from "mapbox-gl";
import View from "react-flexview";
import { Option, none, some, map } from "fp-ts/lib/Option";
import getDrinkingWater, { DrinkingWaterNode } from "./getDrinkingWater";
import DrinkingWaterMarker from "./DrinkingWaterMarker";

import "mapbox-gl/dist/mapbox-gl.css";
import "./map.scss";

/* eslint-disable array-callback-return */

class Map extends React.PureComponent<{}> {
  map: Option<mapboxgl.Map> = none;

  drinkingWaterNodes: {
    [id: string]: DrinkingWaterNode;
  } = {};

  drinkingWaterMarkers: mapboxgl.Marker[] = [];

  updateDrinkingWater = throttle(() => {
    map<mapboxgl.Map, void>(map => {
      getDrinkingWater({
        around: 20000,
        lat: map.getCenter().lat,
        lng: map.getCenter().lng
      }).then(this.addWaterMarkers);
    })(this.map);
  }, 1000);

  initializeMap() {
    (mapboxgl as any).accessToken =
      "pk.eyJ1IjoiZnJhbmNlc2NvY2lvcmlhIiwiYSI6ImNqcThyejR6ODA2ZDk0M25rZzZjcGo4ZmcifQ.yRWHQbG1dJjDp43d01bBOw";

    const map = new mapboxgl.Map({
      container: "map",
      style:
        "mapbox://styles/francescocioria/cjqi3u6lmame92rmw6aw3uyhm?optimize=true",
      center: {
        lat: parseFloat(localStorage.getItem("start_lat") || "45.46"),
        lng: parseFloat(localStorage.getItem("start_lng") || "9.19")
      },
      zoom: 15.0,
      scrollZoom: false
    });

    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true
        }
      })
    );

    map.on("load", () => {
      this.map = some(map);

      this.updateDrinkingWater();
    });

    map.on("move", this.updateDrinkingWater);
  }

  addWaterMarkers = (drinkingWaterNodes: DrinkingWaterNode[]) => {
    map<mapboxgl.Map, void>(map => {
      drinkingWaterNodes.forEach(drinkingWaterNode => {
        if (!this.drinkingWaterNodes[drinkingWaterNode.id]) {
          const element = document.createElement("div");
          ReactDOM.render(<DrinkingWaterMarker />, element);

          const marker: mapboxgl.Marker = new mapboxgl.Marker({
            element
          }).setLngLat([drinkingWaterNode.lon, drinkingWaterNode.lat]);

          marker.addTo(map);

          this.drinkingWaterNodes[drinkingWaterNode.id] = drinkingWaterNode;

          this.drinkingWaterMarkers.push(marker);
        }
      });
    })(this.map);
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

export default Map;

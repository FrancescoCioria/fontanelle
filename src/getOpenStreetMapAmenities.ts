import roundGeoCoordinate from "./roundGeoCoordinate";
import * as localforage from "localforage";
import uniqBy from "lodash/uniqBy";

import "localforage-getitems";

export type OpenStreetMapNode = {
  id: number;
  lat: number;
  lon: number;
  tags: { [k: string]: string; amenity: Amenity };
};

const amenities = ["drinking_water", "toilets", "shower"] as const;

export type Amenity = typeof amenities[number];

export type Options = {
  around: number;
  lat: number;
  lng: number;
};

export default async (options: Options): Promise<OpenStreetMapNode[]> => {
  const roundedLat = roundGeoCoordinate(options.lat);
  const roundedLng = roundGeoCoordinate(options.lng);

  const formData = `
    [out:json];
    (node["amenity"~"${amenities.join("|")}"](around:${
    options.around
  },${roundedLat},${roundedLng}););
    out;>;out;
  `;

  // const OverpassApiService = 'https://overpass-api.de/api/interpreter'
  const OverpassApiService = "https://overpass.kumi.systems/api/interpreter";

  const res = await fetch(`${OverpassApiService}?data=${formData}&output`);

  const json: { elements: OpenStreetMapNode[] } = await res.json();

  const cachedItems =
    (await localforage.getItem<OpenStreetMapNode[]>("amenities")) || [];

  const nodes = uniqBy(cachedItems.concat(json.elements), i => i.id);

  // fire&forget
  localforage.setItem("amenities", nodes);

  return nodes;
};

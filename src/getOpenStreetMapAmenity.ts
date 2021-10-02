import roundGeoCoordinate from "./roundGeoCoordinate";
import * as localforage from "localforage";
import uniqBy from "lodash/uniqBy";

import "localforage-getitems";

export type OpenStreetMapNode = { id: number; lat: number; lon: number };
export type Options = {
  amenity: "drinking_water" | "toilets";
  around: number;
  lat: number;
  lng: number;
};

export default async (options: Options): Promise<OpenStreetMapNode[]> => {
  const roundedLat = roundGeoCoordinate(options.lat);
  const roundedLng = roundGeoCoordinate(options.lng);

  const formData = `
    [out:json];
    (node["amenity"="${options.amenity}"](around:${options.around},${roundedLat},${roundedLng}););
    out;>;out;
  `;

  const res = await fetch(
    `https://overpass-api.de/api/interpreter?data=${formData}&output`
  );

  const json: { elements: OpenStreetMapNode[] } = await res.json();

  const cachedItems =
    (await localforage.getItem<OpenStreetMapNode[]>(options.amenity)) || [];

  const nodes = uniqBy(cachedItems.concat(json.elements), i => i.id);

  // fire&forget
  localforage.setItem(options.amenity, nodes);

  return nodes;
};

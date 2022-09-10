import * as localforage from "localforage";
import uniqBy from "lodash/uniqBy";

import "localforage-getitems";

type AmenityTags = { mapillary?: string } & (
  | {
      amenity: "drinking_water";
    }
  | {
      amenity: "toilets";
      access?: "yes" | "public" | "permissive" | "unknown";
      changing_table?: "yes" | "no" | "unknown";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
      wheelchair?: "yes" | "no" | "unknown" | "limited";
      unisex?: "yes" | "male" | "female";
    }
  | {
      amenity: "shower";
      access?: "yes" | "public" | "permissive" | "unknown";
      hot_water?: "yes" | "no" | "unknown";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
      wheelchair?: "yes" | "no" | "unknown" | "limited";
    }
);

export type OpenStreetMapNode = {
  id: number;
  lat: number;
  lon: number;
  tags: AmenityTags;
};

const amenities = ["drinking_water", "toilets", "shower"] as const;

export type Amenity = typeof amenities[number];

export type Options = {
  around: number;
  lat: number;
  lng: number;
};

export default async (options: Options): Promise<OpenStreetMapNode[]> => {
  const formData = `
    [out:json];
    (node["amenity"~"${amenities.join("|")}"](around:${options.around},${
    options.lat
  },${options.lng}););
    out;>;out;
  `;

  // const OverpassApiService = 'https://overpass-api.de/api/interpreter'
  const OverpassApiService = "https://overpass.kumi.systems/api/interpreter";

  const res = await fetch(`${OverpassApiService}?data=${formData}&output`);

  const json: { elements: OpenStreetMapNode[] } = await res.json();

  const cachedItems =
    (await localforage.getItem<OpenStreetMapNode[]>("amenities")) || [];

  const nodes = uniqBy(json.elements.concat(cachedItems), i => i.id);

  // fire&forget
  localforage.setItem("amenities", nodes);

  return json.elements;
};

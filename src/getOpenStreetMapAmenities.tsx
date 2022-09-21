import * as localforage from "localforage";
import uniqBy from "lodash/uniqBy";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import PublicToiletsMarker from "./PublicToiletsMarker";
import PublicShowerMarker from "./PublicShowerMarker";
import BicycleRepairStationMarker from "./BicycleRepairStationMarker";
import PublicBathMarker from "./PublicBathMarker";

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
  | {
      amenity: "public_bath";
      access?: "yes" | "public" | "permissive" | "unknown";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
    }
  | {
      amenity: "bicycle_repair_station";
    }
);

export type OpenStreetMapNode = {
  id: number;
  lat: number;
  lon: number;
  tags: AmenityTags;
};

const amenitiesMap: { [k in Amenity]: Amenity } = {
  drinking_water: "drinking_water",
  shower: "shower",
  toilets: "toilets",
  public_bath: "public_bath",
  bicycle_repair_station: "bicycle_repair_station"
};

export const amenities = Object.values(amenitiesMap);

export type Amenity = AmenityTags["amenity"];

export type Options = {
  around: number;
  lat: number;
  lng: number;
};

export const updateCachedItems = async (newNodes: OpenStreetMapNode[]) => {
  const cachedItems =
    (await localforage.getItem<OpenStreetMapNode[]>("amenities")) || [];

  const nodes = uniqBy(newNodes.concat(cachedItems), i => i.id);

  // fire&forget
  localforage.setItem("amenities", nodes);
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

  updateCachedItems(json.elements);

  return json.elements;
};

export const getAmenityMarker = (
  amenityTags: AmenityTags,
  size: number
): JSX.Element => {
  const color = (): string => {
    if (
      "access" in amenityTags &&
      amenityTags.access &&
      !["yes", "public", "unknown", "permissive"].includes(amenityTags.access)
    ) {
      return "#d0d0d0";
    } else if (
      "fee" in amenityTags &&
      typeof amenityTags.fee === "string" &&
      amenityTags.fee !== "no"
    ) {
      return "gold";
    }

    return "white";
  };

  switch (amenityTags.amenity) {
    case "drinking_water":
      return <DrinkingWaterMarker size={size} />;
    case "toilets":
      return <PublicToiletsMarker size={size} color={color()} />;
    case "shower":
      return <PublicShowerMarker size={size} color={color()} />;
    case "bicycle_repair_station":
      return <BicycleRepairStationMarker size={size} />;
    case "public_bath":
      return <PublicBathMarker size={size} color={color()} />;
  }
};

export const getAmenityTitle = (amenity: Amenity): string => {
  switch (amenity) {
    case "drinking_water":
      return "Drinking Water";
    case "toilets":
      return "Public Toilets";
    case "shower":
      return "Public Shower";
    case "bicycle_repair_station":
      return "Bicycle Repair Station";
    case "public_bath":
      return "Public Bath";
  }
};

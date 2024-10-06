import * as localforage from "localforage";
import uniqBy from "lodash/uniqBy";
import flatten from "lodash/flatten";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import PublicToiletsMarker from "./PublicToiletsMarker";
import PublicShowerMarker from "./PublicShowerMarker";
import BicycleRepairStationMarker from "./BicycleRepairStationMarker";
import PublicBathMarker from "./PublicBathMarker";
import DeviceChargingStationMarker from "./DeviceChargingStationMarker";
import OpeningHours from "opening_hours";

import "localforage-getitems";

type AmenityTags = { mapillary?: string } & (
  | {
      amenity: "drinking_water";
      indoor?: "yes" | "no";
    }
  | {
      amenity: "toilets";
      access?: "yes" | "public" | "permissive" | "unknown";
      changing_table?: "yes" | "no" | "unknown";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
      wheelchair?: "yes" | "no" | "unknown" | "limited";
      unisex?: "yes" | "male" | "female";
      opening_hours?: string;
      "toilets:disposal"?: "flush" | "chemical" | "pitlatrine";
      indoor?: "yes" | "no";
    }
  | {
      amenity: "shower";
      access?: "yes" | "public" | "permissive" | "unknown";
      hot_water?: "yes" | "no" | "unknown";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
      wheelchair?: "yes" | "no" | "unknown" | "limited";
      opening_hours?: string;
      indoor?: "yes" | "no";
    }
  | {
      amenity: "public_bath";
      access?: "yes" | "public" | "permissive" | "unknown";
      fee?: "yes" | "no" | "unknown";
      charge?: string;
      opening_hours?: string;
      indoor?: "yes" | "no";
    }
  | {
      amenity: "bicycle_repair_station";
      indoor?: "yes" | "no";
    }
  | {
      amenity: "device_charging_station";
      indoor?: "yes" | "no";
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
  bicycle_repair_station: "bicycle_repair_station",
  device_charging_station: "device_charging_station"
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
  const res = await Promise.all(
    [
      amenities.slice(0, amenities.length / 2),
      amenities.slice(amenities.length / 2)
    ].map(async amenitiesGroup => {
      const formData = `
        [out:json];
        (nwr["amenity"~"${amenitiesGroup.join("|")}"](around:${
        options.around
      },${options.lat},${options.lng}););
        out;>;out;
      `;

      const OverpassApiService = "https://overpass-api.de/api/interpreter";
      // const OverpassApiService =
      //   "https://overpass.kumi.systems/api/interpreter";

      const res = await fetch(`${OverpassApiService}?data=${formData}&output`);

      const json: { elements: OpenStreetMapNode[] } = await res.json();

      updateCachedItems(json.elements);

      return json.elements.filter(v => v.tags);
    })
  );

  return flatten(res);
};

export const getAmenityMarker = (
  amenityTags: AmenityTags,
  size: number
): JSX.Element => {
  const disabledColor = "#d0d0d0";

  const closed = (): string | null => {
    try {
      if ("opening_hours" in amenityTags && amenityTags.opening_hours) {
        const oh = new OpeningHours(amenityTags.opening_hours);

        return oh.getUnknown() ? null : oh.getState() ? null : disabledColor;
      }

      return null;
    } catch (e) {
      return null;
    }
  };

  const notPublic = (): string | null => {
    return "access" in amenityTags &&
      amenityTags.access &&
      !["yes", "public", "unknown", "permissive"].includes(amenityTags.access)
      ? disabledColor
      : null;
  };

  const feeRequired = (): string | null => {
    return "fee" in amenityTags &&
      typeof amenityTags.fee === "string" &&
      amenityTags.fee !== "no"
      ? "gold"
      : null;
  };

  const color = (): string => {
    return closed() || notPublic() || feeRequired() || "white";
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
    case "device_charging_station":
      return <DeviceChargingStationMarker size={size} />;
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
    case "device_charging_station":
      return "Phone Charging Station";
  }
};

import { renderToStaticMarkup } from "react-dom/server";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import PublicToiletsMarker from "./PublicToiletsMarker";
import PublicShowerMarker from "./PublicShowerMarker";
import BicycleRepairStationMarker from "./BicycleRepairStationMarker";
import PublicBathMarker from "./PublicBathMarker";
import DeviceChargingStationMarker from "./DeviceChargingStationMarker";
import { AmenityTags, getAmenityColor } from "./getOpenStreetMapAmenities";

export const AMENITIES_SOURCE = "amenities-source";
export const AMENITIES_LAYER = "amenities-layer";

const ICON_SIZE = 48;
const COLORS = ["white", "gold", "#d0d0d0"];

function ensureXmlns(svg: string): string {
  if (!svg.includes("xmlns=")) {
    return svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svg;
}

function svgToImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function renderIcon(element: JSX.Element): string {
  return ensureXmlns(renderToStaticMarkup(element));
}

export async function registerMapIcons(map: mapboxgl.Map): Promise<void> {
  const svgEntries: [string, string][] = [];

  svgEntries.push([
    "drinking_water",
    renderIcon(<DrinkingWaterMarker size={ICON_SIZE} />)
  ]);
  svgEntries.push([
    "bicycle_repair_station",
    renderIcon(<BicycleRepairStationMarker size={ICON_SIZE} />)
  ]);
  svgEntries.push([
    "device_charging_station",
    renderIcon(<DeviceChargingStationMarker size={ICON_SIZE} />)
  ]);

  for (const color of COLORS) {
    svgEntries.push([
      `toilets-${color}`,
      renderIcon(<PublicToiletsMarker size={ICON_SIZE} color={color} />)
    ]);
    svgEntries.push([
      `shower-${color}`,
      renderIcon(<PublicShowerMarker size={ICON_SIZE} color={color} />)
    ]);
    svgEntries.push([
      `public_bath-${color}`,
      renderIcon(<PublicBathMarker size={ICON_SIZE} color={color} />)
    ]);
  }

  await Promise.all(
    svgEntries.map(async ([name, svg]) => {
      const img = await svgToImage(svg);
      map.addImage(name, img, { pixelRatio: 2 });
    })
  );
}

export function getIconName(tags: AmenityTags): string {
  switch (tags.amenity) {
    case "drinking_water":
    case "bicycle_repair_station":
    case "device_charging_station":
      return tags.amenity;
    case "toilets":
    case "shower":
    case "public_bath":
      return `${tags.amenity}-${getAmenityColor(tags)}`;
  }
}

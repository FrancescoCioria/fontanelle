import { renderToStaticMarkup } from "react-dom/server";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import PublicToiletsMarker from "./PublicToiletsMarker";
import PublicShowerMarker from "./PublicShowerMarker";
import BicycleRepairStationMarker from "./BicycleRepairStationMarker";
import PublicBathMarker from "./PublicBathMarker";
import DeviceChargingStationMarker from "./DeviceChargingStationMarker";
import PlaygroundMarker from "./PlaygroundMarker";
import PicnicMarker from "./PicnicMarker";
import ElevatorMarker from "./ElevatorMarker";
import {
  Amenity,
  AmenityTags,
  getAmenityColor,
  hasFee
} from "./getOpenStreetMapAmenities";

// One source per amenity, because Mapbox clusters per source: a single shared
// source would merge a fountain and a playground into one anonymous bubble.
// Keeping them apart is what lets a cluster stay recognizable as "6 fountains".
export const sourceId = (amenity: Amenity) => `amenities-${amenity}-source`;
export const clusterLayerId = (amenity: Amenity) => `amenities-${amenity}-cluster`;
export const markerLayerId = (amenity: Amenity) => `amenities-${amenity}-marker`;

/** At and below this zoom, nearby amenities collapse into a numbered bubble. */
export const CLUSTER_MAX_ZOOM = 14;

/**
 * How far apart (in screen px) two points can be and still merge. Drives how
 * far a bubble can drift from what it represents: the centroid sits among its
 * members, so a wide radius parks it between them, in a different block than
 * anything it stands for. Measured around Turro at z13: 50px gave a median
 * drift of 108m and a worst case of 243m.
 */
export const CLUSTER_RADIUS = 30;

/** A cluster wears its amenity's plain icon — status varies within the group. */
export const getClusterIconName = (amenity: Amenity): string =>
  getIconName({ amenity } as AmenityTags);

const ICON_SIZE = 48;

/**
 * The status axis: open, and closed-or-restricted. ⚠️ "gold" was the third one
 * until 2026-08-11 — a fee is a coin badge now, a separate dimension of the
 * sprite matrix below, so it can show on a closed one too.
 */
const COLORS = ["white", "#d0d0d0"];
const FEES = [false, true];

/**
 * The part of a sprite name that varies with the node's state. ⚠️ Written in
 * exactly one place, because `registerMapIcons` and `getIconName` have to agree
 * character by character: a name nobody registered is an invisible marker with
 * no error.
 */
const statusSuffix = (color: string, fee: boolean): string =>
  `${fee ? "-fee" : ""}-${color}`;

/**
 * The markers whose sprite depends on the node's state, by sprite base name.
 * ⚠️ A table rather than a `push` per component: the name and the component
 * that draws it sit on the same line, so a rename can't leave a sprite nobody
 * asks for (or a name nobody registers), and a new amenity is one row.
 */
const STATUS_MARKERS: [string, (color: string, fee: boolean) => JSX.Element][] =
  [
    [
      "toilets",
      (color, fee) => (
        <PublicToiletsMarker size={ICON_SIZE} color={color} fee={fee} />
      )
    ],
    [
      "toilets-baby",
      (color, fee) => (
        <PublicToiletsMarker
          size={ICON_SIZE}
          color={color}
          fee={fee}
          changingTable
        />
      )
    ],
    [
      "picnic",
      (color, fee) => <PicnicMarker size={ICON_SIZE} color={color} fee={fee} />
    ],
    [
      "shower",
      (color, fee) => (
        <PublicShowerMarker size={ICON_SIZE} color={color} fee={fee} />
      )
    ],
    [
      "public_bath",
      (color, fee) => (
        <PublicBathMarker size={ICON_SIZE} color={color} fee={fee} />
      )
    ],
    [
      "playground",
      (color, fee) => (
        <PlaygroundMarker size={ICON_SIZE} color={color} fee={fee} />
      )
    ],
    [
      "elevator",
      (color, fee) => (
        <ElevatorMarker size={ICON_SIZE} color={color} fee={fee} />
      )
    ]
  ];

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
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG image"));
    };
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
    for (const fee of FEES) {
      for (const [base, marker] of STATUS_MARKERS) {
        svgEntries.push([
          `${base}${statusSuffix(color, fee)}`,
          renderIcon(marker(color, fee))
        ]);
      }
    }
  }

  await Promise.all(
    svgEntries.map(async ([name, svg]) => {
      const img = await svgToImage(svg);
      map.addImage(name, img, { pixelRatio: 2 });
    })
  );
}

export function getIconName(tags: AmenityTags): string {
  // ⚠️ not hoisted above the switch: the three amenities that have a single
  // sprite must not pay for `getAmenityColor`, which parses `opening_hours`,
  // once per node on every feature rebuild
  const status = () => statusSuffix(getAmenityColor(tags), hasFee(tags));

  switch (tags.amenity) {
    case "drinking_water":
    case "bicycle_repair_station":
    case "device_charging_station":
      return tags.amenity;
    case "toilets":
      // a changing table gets its own sprite rather than a second layer
      return `toilets${tags.changing_table === "yes" ? "-baby" : ""}${status()}`;
    case "shower":
    case "public_bath":
    case "playground":
    case "picnic":
    case "elevator":
      return `${tags.amenity}${status()}`;
  }
}

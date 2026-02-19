import { renderToStaticMarkup } from "react-dom/server";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import PublicToiletsMarker from "./PublicToiletsMarker";
import PublicShowerMarker from "./PublicShowerMarker";
import BicycleRepairStationMarker from "./BicycleRepairStationMarker";
import PublicBathMarker from "./PublicBathMarker";
import { AmenityTags, getAmenityColor } from "./getOpenStreetMapAmenities";

export const AMENITIES_SOURCE = "amenities-source";
export const AMENITIES_LAYER = "amenities-layer";

const ICON_SIZE = 40;
const COLORS = ["white", "gold", "#d0d0d0"];

const DEVICE_CHARGING_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAYAAADhu0ooAAAAAXNSR0IArs4c6QAABTJJREFUaEPlm0tsG0UYx3/BSRoncRoQaUOSiqSB0CIFkLhQIYQoapF4SK3KCbU8LnCBcMqNKxc4kXLqpbzECfGmEq0AISQeBySgUtukog1Qp2mLwHVc2zRxjP7xjLoya3vXWS/Z+JNG3thj7/zm/803szNfWmgSa2kSThoF6vxdr/coOjrdeR2IFl4b4fVm9veug5VO1Ku9rnQvQaksm2Kvdc/AgFcLWq6chWsF2oB286q/BexmAlwCFoGr5lV/633bCfZ7dYPXC+pUzioWA1QEGAe6TekCOgDBlt9PDRdUHrgCZEzJGeACoOJUvC6l6wHVd1QEpcZLNZUNpnQCvcAm4EbgBiBhPnMD/QdYAP4C/gQuAikgC+gzFSmtok6x4L7UrQdUCgpQYFJrI9BjYAQkyM3ACDBgrvWeVC13X7mn1BTYBWAOOGuu9Z46QCUNXDaqC9y6ttfY4TvqqmMEqUar8f3AFuAmoM+h4BAwZiA9N8YAzgDnHApfAs4DfwDzplPUOYL1rKpfReWuUlIqCvB24G5g1KHe9abOCuDEoXvZsl3VK9vvJ1IcfO5bZwWp9rdD5V+BH4ETBljqqo7c2JP5AbXjUkFGLjkO7AQeAm6udLdXv3nYU0Mm7ztSrd5vwOfAl8Bx4+IKXHa81ryHX1AFHSl2K3A/8ASwfduOPh6fHGdjnzw6OLt8Kc97rxzn1PfyXk4C7wJfA6eN4gpQntzXD6gCidxWgeYuYA/wlFrw0vs7A4e03ZW6mOflfRJyxd4EPgR+Mm4t91VAq2l+QDU+NT8OAjuAJ4EHdAev7lmzNRUqONz6K+At4DsgCWi+9TRO/YJqOtF4lNs+a8ZpmKAan4eM+2rcapHREFAFIs2PDwLPA8MhKzoLvA58YeZbG5BqOotfRbUg2ArsAl4wbhymonLXg8Ax4IxZTDREUQu6G3jRLBjCBNWC4TXgaBigWhwIdGK1oIPxAsmcYlx1cwQjgU4ZUC0itDxsmKKBgI52L9HVuswvKU3N6xR0Q6zIMyMZPjjXyYX8Olb0kYEsY4klpmYSFIq142EkXXe0e5G9Q1nm8zHemdVsVdsiBxqPLfP0SIau1iI/p9o5Nq+FVm2LHOijAzm29WgdDkfn454CkepGCtS6rNXv7dluT4EoUqBxRdmtGTpjpQcNBaCpmR4Knh6wIqToY4NZbktoN7NkfgJRZBS9JbHInkFt6F0zP4EoEqDlLlstvk4vtPFJUjul/7U1H4zKXbYSaK7QwuEzCbIF98XDmgd1A9vdn+OO3tIUY+3jZCczC9rgd7dIgh4YzrC549oDx6l0O5/OVV84RA401lJkYixNzHioXPWNKi5r9Y0caH9Hgf3D2v0oWS2XjSzonb1X2dWvjTs4mW7jszn3KFs+UiOnqA1EXl02soraQPRRspPTVaJspBW1gWg63c6R894ezyKpqALR3qErHD6bIF9hYbAu5lEFIo1NPy4bSUW9bm2upbWuduqbYgO7KY4kmuaQqWmODZviILhpjvb1cOWerHFPH/smx+ndFGyyhvIXlKwx/UO4yRp1pd9U3Dbw90Go6TdqWqWEKk05ylZRqpwyV2qfHFUH1Y6vMk6UGqfUOZ1uh5ZQpaZVS5FT/pGistw7CFBtLCkZQxlkoafICdYt6VFH/oKUmlI9CFBtLElVwepkO9SkR6uqWxqrtvEEWSkB2d+oLCVKCdYmLIeexmphrbrOtHKby+sXyq2+MwX9f0lMdjaqPNU8CMDy3wjknwpWO5YaAdaQ32wa0H8B/QSgWQcm2LMAAAAASUVORK5CYII=";

function ensureXmlns(svg: string): string {
  if (!svg.includes("xmlns=")) {
    return svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svg;
}

function stripRootStyle(svg: string): string {
  return svg.replace(/^(<svg[^>]*?)\s+style="[^"]*"/, "$1");
}

function addBgRect(
  svg: string,
  color: string,
  vbW: number,
  vbH: number,
  rx: number,
  vbX: number = 0,
  vbY: number = 0
): string {
  const rect = `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" rx="${rx}" ry="${rx}" fill="${color}"/>`;
  return svg.replace(/>/, `>${rect}`);
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function resizeToCanvas(
  img: HTMLImageElement,
  size: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, size, size);
  return canvas;
}

function generateDrinkingWaterIcon(): string {
  let svg = renderToStaticMarkup(<DrinkingWaterMarker size={ICON_SIZE} />);
  return ensureXmlns(svg);
}

function generateToiletsIcon(color: string): string {
  let svg = renderToStaticMarkup(
    <PublicToiletsMarker size={ICON_SIZE} color={color} />
  );
  svg = ensureXmlns(svg);
  svg = stripRootStyle(svg);
  svg = addBgRect(svg, color, 395, 395, 66);
  return svg;
}

function generateShowerIcon(color: string): string {
  let svg = renderToStaticMarkup(
    <PublicShowerMarker size={ICON_SIZE} color={color} />
  );
  return ensureXmlns(svg);
}

function generateBicycleRepairIcon(): string {
  let svg = renderToStaticMarkup(
    <BicycleRepairStationMarker size={ICON_SIZE} />
  );
  svg = ensureXmlns(svg);
  svg = stripRootStyle(svg);
  return svg;
}

function generatePublicBathIcon(color: string): string {
  let svg = renderToStaticMarkup(
    <PublicBathMarker size={ICON_SIZE} color={color} />
  );
  svg = ensureXmlns(svg);
  svg = stripRootStyle(svg);
  svg = addBgRect(svg, color, 752, 752, 228);
  // Convert CSS transform on <g> to SVG transform attribute
  svg = svg.replace(
    /style="transform:scale\(1\.3\);transform-origin:50% 50%"/,
    'transform="translate(376, 376) scale(1.3) translate(-376, -376)"'
  );
  // Ensure overflow hidden for clipping the scaled content
  svg = svg.replace("<svg ", '<svg overflow="hidden" ');
  return svg;
}

export async function registerMapIcons(map: mapboxgl.Map): Promise<void> {
  const svgEntries: [string, string][] = [];

  svgEntries.push(["drinking_water", generateDrinkingWaterIcon()]);
  svgEntries.push(["bicycle_repair_station", generateBicycleRepairIcon()]);

  for (const color of COLORS) {
    svgEntries.push([`toilets-${color}`, generateToiletsIcon(color)]);
    svgEntries.push([`shower-${color}`, generateShowerIcon(color)]);
    svgEntries.push([`public_bath-${color}`, generatePublicBathIcon(color)]);
  }

  await Promise.all(
    svgEntries.map(async ([name, svg]) => {
      const img = await svgToImage(svg);
      map.addImage(name, img, { pixelRatio: 2 });
    })
  );

  // DeviceChargingStation: load PNG and resize to match other icons
  const pngImg = await loadImage(DEVICE_CHARGING_PNG);
  const canvas = resizeToCanvas(pngImg, ICON_SIZE);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
  map.addImage("device_charging_station", imageData, { pixelRatio: 2 });
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

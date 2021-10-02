import roundGeoCoordinate from "./roundGeoCoordinate";

export type DrinkingWaterNode = { id: number; lat: number; lon: number };

export default async (options: {
  around: number;
  lat: number;
  lng: number;
}): Promise<DrinkingWaterNode[]> => {
  const roundedLat = roundGeoCoordinate(options.lat);
  const roundedLng = roundGeoCoordinate(options.lng);

  const formData = `
    [out:json];
    (node["amenity"="drinking_water"](around:${options.around},${roundedLat},${roundedLng}););
    out;>;out;
  `;

  return fetch(
    `https://overpass-api.de/api/interpreter?data=${formData}&output`
  )
    .then((res): Promise<{ elements: DrinkingWaterNode[] }> => res.json())
    .then(res => res.elements);
};

export type DrinkingWaterNode = { id: number; lat: number; lon: number };

export default async (options: {
  around: number;
  lat: number;
  lng: number;
}): Promise<DrinkingWaterNode[]> => {
  // round to second decimal (ex: 45.537 -> 45.54; 45.4923 -> 45.49)
  const roundedLat = Math.round(options.lat * 100) / 100;
  const roundedLng = Math.round(options.lng * 100) / 100;

  const formData = `
    [out:json];
    (node["amenity"="drinking_water"](around:${options.around},${roundedLat},${roundedLng}););
    out;>;out;
  `;

  return fetch(
    `https://overpass-api.de/api/interpreter?data=${formData}&output&cache-only=true`
  )
    .then((res): Promise<{ elements: DrinkingWaterNode[] }> => res.json())
    .then(res => res.elements);
};

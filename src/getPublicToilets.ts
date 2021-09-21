export type PublicToiletsNode = { id: number; lat: number; lon: number };

export default async (options: {
  around: number;
  lat: number;
  lng: number;
}): Promise<PublicToiletsNode[]> => {
  // round to second decimal (ex: 45.537 -> 45.54; 45.4923 -> 45.49)
  const roundedLat = Math.round(options.lat * 100) / 100;
  const roundedLng = Math.round(options.lng * 100) / 100;

  const formData = `
    [out:json];
    (node["amenity"="toilets"](around:${options.around},${roundedLat},${roundedLng}););
    out;>;out;
  `;

  return fetch(
    `https://overpass-api.de/api/interpreter?data=${formData}&output`
  )
    .then((res): Promise<{ elements: PublicToiletsNode[] }> => res.json())
    .then(res => res.elements);
};

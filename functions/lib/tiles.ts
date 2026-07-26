/**
 * The server caches OSM data per *tile*, not per request.
 *
 * A `(around:R,lat,lon)` query has an unbounded key — every pan makes a new
 * one, so nothing is ever a cache hit. Snapping to a fixed slippy-tile grid
 * gives a stable key that two different users, on two different days, looking
 * at the same street will share.
 */

/**
 * z12 ≈ 6.9km per side at lat 45. Chosen so the default 1km radius needs 1–4
 * tiles, and the 15km maximum stays inside the per-request refresh budget.
 * ⚠️ Changing it orphans every cached tile (the keys carry the zoom), so the
 * old rows keep answering nothing. Clear the `tiles` table if you ever do.
 */
export const TILE_ZOOM = 12;

export type Tile = { z: number; x: number; y: number; key: string };

export type BBox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

const MAX_LAT = 85.0511287798066;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const tileKey = (z: number, x: number, y: number) => `${z}/${x}/${y}`;

const lonToTileX = (lon: number, z: number): number =>
  clamp(
    Math.floor(((lon + 180) / 360) * Math.pow(2, z)),
    0,
    Math.pow(2, z) - 1
  );

const latToTileY = (lat: number, z: number): number => {
  const rad = (clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180;

  return clamp(
    Math.floor(
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
        Math.pow(2, z)
    ),
    0,
    Math.pow(2, z) - 1
  );
};

export const tileForPoint = (lat: number, lon: number, z = TILE_ZOOM): Tile => {
  const x = lonToTileX(lon, z);
  const y = latToTileY(lat, z);

  return { z, x, y, key: tileKey(z, x, y) };
};

const tileYToLat = (y: number, z: number): number => {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);

  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

export const tileBBox = (tile: Tile): BBox => ({
  west: (tile.x / Math.pow(2, tile.z)) * 360 - 180,
  east: ((tile.x + 1) / Math.pow(2, tile.z)) * 360 - 180,
  north: tileYToLat(tile.y, tile.z),
  south: tileYToLat(tile.y + 1, tile.z)
});

const latDeltaFor = (meters: number) => meters / 110574;

const lonDeltaFor = (meters: number, lat: number) =>
  meters / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));

/**
 * The box the caller actually asked about. Reads use this rather than the union
 * of the covering tiles: the tiles always overflow the circle, and every row
 * outside it gets filtered out in memory anyway.
 */
export const radiusBBox = (
  lat: number,
  lon: number,
  radiusMeters: number
): BBox => ({
  south: lat - latDeltaFor(radiusMeters),
  north: lat + latDeltaFor(radiusMeters),
  west: lon - lonDeltaFor(radiusMeters, lat),
  east: lon + lonDeltaFor(radiusMeters, lat)
});

/** Metres, equirectangular — plenty for ordering tiles and clipping a radius. */
export const distanceMeters = (
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number => {
  const meanLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (b.lon - a.lon) * 111320 * Math.cos(meanLat);
  const dy = (b.lat - a.lat) * 110574;

  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Every tile touching the circle, nearest first — so a request that can't
 * refresh them all this time refreshes the ones under the user's nose.
 */
export const tilesForRadius = (
  lat: number,
  lon: number,
  radiusMeters: number,
  z = TILE_ZOOM
): Tile[] => {
  const box = radiusBBox(lat, lon, radiusMeters);

  const xMin = lonToTileX(box.west, z);
  const xMax = lonToTileX(box.east, z);
  // y grows southwards, so the north edge gives the smaller index
  const yMin = latToTileY(box.north, z);
  const yMax = latToTileY(box.south, z);

  const tiles: { tile: Tile; d: number }[] = [];

  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const tile = { z, x, y, key: tileKey(z, x, y) };
      const box = tileBBox(tile);

      tiles.push({
        tile,
        d: distanceMeters(
          { lat, lon },
          {
            lat: (box.north + box.south) / 2,
            lon: (box.east + box.west) / 2
          }
        )
      });
    }
  }

  return tiles.sort((a, b) => a.d - b.d).map(t => t.tile);
};

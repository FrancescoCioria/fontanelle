/**
 * A distance the way the app says it out loud: "800 m", "1 km", "1.5 km".
 *
 * ⚠️ One spelling, because two places print the same number — the radius
 * slider in the menu and the search's "no results within …" line — and they are
 * read one after the other. Two copies drift into "1 km" and "1000 m" for the
 * same setting, which reads as two different settings.
 */
export const formatDistance = (meters: number): string =>
  meters >= 1000
    ? `${(meters / 1000).toFixed(meters % 1000 === 0 ? 0 : 1)} km`
    : `${meters} m`;

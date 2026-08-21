/**
 * The pin every search result wears.
 *
 * ⚠️ One sprite for the whole catalogue, deliberately category-neutral. The
 * app's own markers say *what* a thing is because it is always one of eight
 * known kinds; a search draws one preset at a time and the answer to "what am I
 * looking at" is already on screen, in the bar naming the search. Drawing 70
 * glyphs to repeat it would be 70 icons to keep legible at the 24px these
 * render at — and the reason this feature exists is that a preset costs one
 * line.
 *
 * Primary blue, so results read as "the thing you just asked for" rather than
 * as another amenity, and a white core so the pin survives a dark basemap.
 */
export default (props: { size: number }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill="#0ea5e9" stroke="white" strokeWidth="3" />
    <circle cx="50" cy="50" r="17" fill="white" />
  </svg>
);

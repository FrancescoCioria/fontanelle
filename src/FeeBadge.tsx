/**
 * "You pay here": a coin stuck in the marker's top-right corner.
 *
 * ⚠️ A fee is NOT a colour any more (2026-08-11, after the same fix in
 * `viaggi`). The marker's fill already says two things — which amenity this is
 * and whether it's usable right now — and painting a paid one gold made it say
 * a third with the same ink: to read one you had to remember the others, and a
 * toilet that is *both* paid and closed could only ever show one of the two
 * (`getAmenityColor` returns a single string, closed wins). The coin is a
 * second sign: it's either there or it isn't, and it composes with any fill.
 * The gold is the one the fill used to be (#eab308), so the palette didn't
 * change — only which channel carries the price.
 *
 * ⚠️ Top-right, because the toilets' changing-table badge owns the
 * bottom-right and the two show up together.
 * ⚠️ Sized to survive ~24px, the size markers actually render at: solid disc
 * with a white ring first, € second. At 24px it reads as "this one has
 * something extra" and the glyph resolves on zoom — the same bet the baby
 * badge makes. Verified at 24/32/64px before committing; a coin big enough to
 * make the € legible on its own buried the icon underneath it.
 *
 * Meant to be dropped inside a marker's `viewBox="0 0 100 100"`, last, so it
 * paints over the glyph.
 */
export default () => (
  <>
    <circle cx="78" cy="22" r="20.4" fill="white" />
    <circle cx="78" cy="22" r="17" fill="#eab308" />
    {/* the €, drawn around its own origin and then dropped on the coin's
        centre: the disc's position lives in one place, not in every path */}
    <g
      transform="translate(78 22) scale(0.85)"
      fill="none"
      stroke="white"
      strokeWidth="4.5"
      strokeLinecap="round"
    >
      <path d="M9.4 -10A13 13 0 1 0 9.4 10" />
      <path d="M-14 -4h20" />
      <path d="M-14 4h20" />
    </g>
  </>
);

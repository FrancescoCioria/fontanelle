import FeeBadge from "./FeeBadge";
import statusColor from "./statusColor";

export default (props: { color: string; size: number; fee?: boolean }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 100 100">
    <circle
      cx="50"
      cy="50"
      r="48"
      fill={statusColor(props.color, "#475569")}
      stroke="white"
      strokeWidth="3"
    />
    {/* The two-arrow lift glyph. Solid heads with thick stems on purpose: the
        outlined-cabin version turned to mush at the 24px the marker actually
        renders at, and thin stems disappeared. Verified at 24px.
        ⚠️ Scaled about the circle's centre rather than redrawn: at full size
        the arrows reached the rim (x 16→84, y 20→80 of a 100 box) and the
        marker read as a solid block, while every other amenity's artwork sits
        inside a margin. 0.82 keeps the stems thick at 24px — compared against
        1 / 0.88 / 0.76 / 0.7 before picking. */}
    <g fill="white" transform="translate(50 50) scale(0.82) translate(-50 -50)">
      <polygon points="16,54 46,54 31,20" />
      <rect x="25.5" y="52" width="11" height="28" />
      <polygon points="54,46 84,46 69,80" />
      <rect x="63.5" y="20" width="11" height="28" />
    </g>

    {props.fee && <FeeBadge />}
  </svg>
);

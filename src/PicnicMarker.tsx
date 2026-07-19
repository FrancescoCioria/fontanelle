import statusColor from "./statusColor";

export default (props: { color: string; size: number }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 100 100">
    <circle
      cx="50"
      cy="50"
      r="48"
      fill={statusColor(props.color, "#92400e")}
      stroke="white"
      strokeWidth="3"
    />
    {/* Picnic table from the side: top, splayed legs, bench across.
        Centred on the circle (the artwork's own middle is y≈50, not the old
        y≈57) and kept clear of the rim so it reads at ~24px. */}
    <g fill="none" stroke="white" strokeWidth="5.2" strokeLinecap="round">
      <path d="M26.2 35.6h47.6" />
      <path d="M36.4 35.6L29.6 64.5" />
      <path d="M63.6 35.6L70.4 64.5" />
      <path d="M31.3 50.9h37.4" />
    </g>
  </svg>
);

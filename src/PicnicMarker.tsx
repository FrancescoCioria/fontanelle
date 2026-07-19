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
    {/* Picnic table from the side: top, splayed legs, bench across */}
    <g fill="none" stroke="white" strokeWidth="6" strokeLinecap="round">
      <path d="M22 40h56" />
      <path d="M34 40l-8 34" />
      <path d="M66 40l8 34" />
      <path d="M28 58h44" />
    </g>
  </svg>
);

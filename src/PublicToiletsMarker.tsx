import statusColor from "./statusColor";

export default (props: { color: string; size: number }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill={statusColor(props.color, "#8b5cf6")} stroke="white" strokeWidth="3" />
    <g fill="white">
      {/* Male figure */}
      <circle cx="38" cy="32" r="6" />
      <rect x="33" y="40" width="10" height="18" rx="3" />
      <rect x="33" y="55" width="4" height="14" rx="2" />
      <rect x="39" y="55" width="4" height="14" rx="2" />
      {/* Female figure */}
      <circle cx="62" cy="32" r="6" />
      <path d="M55 40h14l-2 18h-10z" />
      <rect x="57" y="55" width="4" height="14" rx="2" />
      <rect x="63" y="55" width="4" height="14" rx="2" />
    </g>
  </svg>
);

import statusColor from "./statusColor";

export default (props: { color: string; size: number }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill={statusColor(props.color, "#f97316")} stroke="white" strokeWidth="3" />
    <g fill="white">
      {/* Arm + pipe */}
      <rect x="31" y="31" width="5" height="40" rx="2.5" />
      <rect x="31" y="31" width="22" height="5" rx="2.5" />
      {/* Shower head dome */}
      <path d="M43 36c0 0 2-8 14-8s14 8 14 8z" />
      <rect x="43" y="36" width="28" height="5" rx="2.5" />
      {/* Drops */}
      <rect x="48" y="45" width="3" height="8" rx="1.5" />
      <rect x="54" y="45" width="3" height="10" rx="1.5" />
      <rect x="60" y="45" width="3" height="10" rx="1.5" />
      <rect x="66" y="45" width="3" height="8" rx="1.5" />
      {/* Knob */}
      <circle cx="33.5" cy="61" r="4" />
    </g>
  </svg>
);

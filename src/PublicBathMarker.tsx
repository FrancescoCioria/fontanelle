const statusColor = (color: string) =>
  color === "gold" ? "#eab308" : color === "#d0d0d0" ? "#9ca3af" : "#ec4899";

export default (props: { size: number; color: string }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill={statusColor(props.color)} stroke="white" strokeWidth="3" />
    <g fill="white">
      {/* Waves */}
      <path
        d="M24 52c4-4 8-4 12 0s8 4 12 0 8-4 12 0 8 4 12 0 8-4 12 0"
        fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"
      />
      <path
        d="M24 64c4-4 8-4 12 0s8 4 12 0 8-4 12 0 8 4 12 0 8-4 12 0"
        fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"
      />
      {/* Person */}
      <circle cx="50" cy="32" r="7" />
    </g>
  </svg>
);

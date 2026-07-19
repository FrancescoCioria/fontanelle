import statusColor from "./statusColor";

export default (props: {
  color: string;
  size: number;
  changingTable?: boolean;
}) => {
  const background = statusColor(props.color, "#8b5cf6");

  return (
    <svg width={props.size} height={props.size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="48" fill={background} stroke="white" strokeWidth="3" />
      <g fill="white">
        {/* Male figure */}
        <circle cx="38" cy="32" r="6" />
        <rect x="33" y="40" width="10" height="18" rx="3" />
        <rect x="33" y="55" width="4" height="14" rx="2" />
        <rect x="39" y="55" width="4" height="14" rx="2" />
        {/* Female figure */}
        <circle cx="62" cy="32" r="6" />
        <path d="M57 40h10l2 18h-14z" />
        <rect x="57" y="55" width="4" height="14" rx="2" />
        <rect x="63" y="55" width="4" height="14" rx="2" />
      </g>

      {/* Baby badge for changing_table=yes. At marker size it reads simply as
          "this one has something extra"; the shape resolves when zoomed. */}
      {props.changingTable && (
        <>
          <circle cx="76" cy="76" r="22" fill="white" stroke={background} strokeWidth="3" />
          <g fill={background}>
            <circle cx="76" cy="68" r="6" />
            <rect x="68" y="76" width="16" height="12" rx="5" />
          </g>
        </>
      )}
    </svg>
  );
};

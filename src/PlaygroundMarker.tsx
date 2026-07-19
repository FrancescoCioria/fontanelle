export default (props: { size: number; color: string }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill="#f43f5e" stroke="white" strokeWidth="3" />
    {/* Slide: ladder on the left, slope down to the right. Kept deliberately
        sparse — a single rung — so it stays readable at marker size (~24px). */}
    <g fill="none" stroke={props.color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M26 74V30" />
      <path d="M46 74V30" />
      <path d="M26 48h20" />
      <path d="M46 30h6l22 44" />
    </g>
  </svg>
);

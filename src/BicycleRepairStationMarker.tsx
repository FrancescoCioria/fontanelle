export default (props: { size: number }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill="#10b981" stroke="white" strokeWidth="3" />
    <g fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      {/* Wrench */}
      <path d="M62 30c-4-2-9-1-12 2s-4 8-2 12l-18 18 6 6 18-18c4 2 9 1 12-2s4-8 2-12l-7 7-4-4 7-7z" />
    </g>
  </svg>
);

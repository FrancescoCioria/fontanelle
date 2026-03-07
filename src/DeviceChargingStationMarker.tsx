export default (props: { size: number }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill="#eab308" stroke="white" strokeWidth="3" />
    <path
      d="M55 24L38 54h14l-7 22 24-32H55z"
      fill="white"
    />
  </svg>
);

export default (props: { size: number }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill="#0ea5e9" stroke="white" strokeWidth="3" />
    <path
      d="M50 25c0 0-18 20-18 33a18 18 0 0 0 36 0c0-13-18-33-18-33z"
      fill="white"
      opacity="0.95"
    />
  </svg>
);

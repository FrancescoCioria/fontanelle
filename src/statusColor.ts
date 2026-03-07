export default function statusColor(color: string, defaultColor: string): string {
  return color === "gold" ? "#eab308" : color === "#d0d0d0" ? "#9ca3af" : defaultColor;
}

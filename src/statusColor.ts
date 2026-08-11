// The marker fill says two things only: which amenity, and whether it is
// usable. ⚠️ A fee used to be a third ("gold"); it is a coin badge now
// (`FeeBadge`), so don't reintroduce a colour for it — see that file.
export default function statusColor(color: string, defaultColor: string): string {
  return color === "#d0d0d0" ? "#9ca3af" : defaultColor;
}

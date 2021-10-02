// round to .x5 (ex: 45.227 -> 45.25; 45.221 -> 45.20)
export default (geoCoordinate: number) => {
  return (Math.round((geoCoordinate * 100) / 5) * 5) / 100;
};

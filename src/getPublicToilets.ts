import getOpenStreetMapAmenity from "./getOpenStreetMapAmenity";

export default (options: { around: number; lat: number; lng: number }) => {
  return getOpenStreetMapAmenity({
    amenity: "toilets",
    ...options
  });
};

import { useEffect, useRef, useState } from "react";
import { BottomSheet, BottomSheetRef } from "react-spring-bottom-sheet";
import { OpenStreetMapNode } from "./getOpenStreetMapAmenities";
import View from "react-flexview";
import DrinkingWaterMarker from "./DrinkingWaterMarker";
import PublicToiletsMarker from "./PublicToiletsMarker";
import PublicShowerMarker from "./PublicShowerMarker";
import { Button } from "./form";
import capitalize from "lodash/capitalize";

import "react-spring-bottom-sheet/dist/style.css";

const Amenity = (props: { label: string; value: string }): JSX.Element => {
  return (
    <View style={{ marginTop: 16 }} column>
      <span style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
        {capitalize(props.label)}
      </span>
      <span style={{ fontSize: 18, wordBreak: "break-all" }}>
        {props.value}
      </span>
    </View>
  );
};

type Props = {
  node: OpenStreetMapNode;
  onDismiss: () => void;
  onEditNode: (node: OpenStreetMapNode) => void;
};

export default (props: Props) => {
  const sheetRef = useRef<BottomSheetRef>(null);

  const [isOpen, updateOpen] = useState(true);

  useEffect(() => {
    updateOpen(true);
  }, [props.node]);

  const color = (tags: OpenStreetMapNode["tags"]): string => {
    if (
      "access" in tags &&
      tags.access &&
      !["yes", "public", "unknown", "permissive"].includes(tags.access)
    ) {
      return "#d0d0d0";
    } else if (
      "fee" in tags &&
      typeof tags.fee === "string" &&
      tags.fee !== "no"
    ) {
      return "gold";
    }

    return "white";
  };

  const icon = (): JSX.Element => {
    switch (props.node.tags.amenity) {
      case "drinking_water":
        return (
          <View vAlignContent="center">
            <DrinkingWaterMarker size={48} />

            <span style={{ marginLeft: 16, fontSize: 24 }}>Drinking Water</span>
          </View>
        );

      case "toilets":
        return (
          <View vAlignContent="center">
            <PublicToiletsMarker color={color(props.node.tags)} size={48} />
            <span style={{ marginLeft: 16, fontSize: 24 }}>Public Toilets</span>
          </View>
        );

      case "shower":
        return (
          <View vAlignContent="center">
            <PublicShowerMarker color={color(props.node.tags)} size={48} />
            <span style={{ marginLeft: 16, fontSize: 24 }}>Public Shower</span>
          </View>
        );
    }
  };

  const openUrl = (url: string) => window.open(url, "_blank");

  return (
    <BottomSheet
      style={{ borderRadius: 40 }}
      open={isOpen}
      ref={sheetRef}
      onDismiss={() => updateOpen(false)}
      onSpringEnd={() => !isOpen && props.onDismiss()}
      snapPoints={({ maxHeight }) => {
        return [window.innerHeight * 0.45, maxHeight];
      }}
      defaultSnap={({ snapPoints }) => snapPoints[0]}
      maxHeight={window.innerHeight * 0.85}
      expandOnContentDrag={true}
    >
      <View
        column
        shrink={false}
        style={{ padding: 32, paddingTop: 12, minHeight: "35vh" }}
      >
        {icon()}

        <View
          style={{
            borderTop: "1px solid #e0e0e0",
            borderBottom: "1px solid #e0e0e0",
            margin: "16px 0",
            padding: "16px 0"
          }}
        >
          <Button
            style={{ flexGrow: 1 }}
            label="Directions"
            onClick={() =>
              openUrl(
                `https://www.google.com/maps/dir//${props.node.lat},${props.node.lon}`
              )
            }
          />

          {props.node.tags.mapillary && (
            <Button
              style={{ flexGrow: 1, marginLeft: 16 }}
              label="See street view"
              onClick={() => openUrl(props.node.tags.mapillary!)}
            />
          )}

          <Button
            style={{ flexGrow: 1, marginLeft: 16 }}
            label="Edit node"
            onClick={() => {
              props.onEditNode(props.node);
              props.onDismiss();
            }}
          />
        </View>

        {Object.keys(props.node.tags).map(k => (
          <Amenity key={k} label={k} value={props.node.tags[k as never]} />
        ))}
      </View>
    </BottomSheet>
  );
};

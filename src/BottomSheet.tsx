import { useEffect, useState } from "react";
import { BottomSheet } from "react-spring-bottom-sheet";
import {
  getAmenityMarker,
  getAmenityTitle,
  OpenStreetMapNode
} from "./getOpenStreetMapAmenities";
import View from "react-flexview";
import { Button } from "./form";
import capitalize from "lodash/capitalize";
import { osmGetNode } from "./osm";

import "react-spring-bottom-sheet/dist/style.css";

const Amenity = (props: { label: string; value: string }): JSX.Element => {
  const clickable = props.value.startsWith("https://");
  return (
    <View style={{ marginTop: 16 }} column>
      <span style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
        {capitalize(props.label)}
      </span>
      {clickable ? (
        <a
          href={props.value}
          target="_blank"
          style={{ fontSize: 18, wordBreak: "break-all", color: "black" }}
        >
          {props.value}
        </a>
      ) : (
        <span
          style={{ fontSize: 18, wordBreak: "break-all" }}
          onClick={() => clickable && window.open(props.value, "_blank")}
        >
          {props.value}
        </span>
      )}
    </View>
  );
};

type Props = {
  node: OpenStreetMapNode;
  onDismiss: () => void;
  onEditNode: (node: OpenStreetMapNode) => void;
};

const mapFileImage = (v: any) =>
  typeof v === "string" && v.startsWith("File:")
    ? `https://commons.wikimedia.org/wiki/${v.replaceAll(" ", "_")}`
    : v;

export default (props: Props) => {
  const [isOpen, updateOpen] = useState(true);

  const [fetchedNode, updateFetchedNode] = useState<
    (OpenStreetMapNode & { timestamp: string; user: string }) | null
  >(null);

  useEffect(() => {
    updateOpen(true);
    osmGetNode(props.node)
      .then(res => updateFetchedNode(res))
      .catch(() => {});
  }, [props.node]);

  const openUrl = (url: string) => window.open(url, "_blank");

  return (
    <BottomSheet
      style={{ borderRadius: 40 }}
      open={isOpen}
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
        <View vAlignContent="center">
          {getAmenityMarker(props.node.tags, 48)}
          <span style={{ marginLeft: 16, fontSize: 24 }}>
            {getAmenityTitle(props.node.tags.amenity)}
          </span>
        </View>

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

        {fetchedNode && (
          <Amenity label="Creation date" value={fetchedNode.timestamp} />
        )}
        {fetchedNode && <Amenity label="Created by" value={fetchedNode.user} />}

        {Object.keys(props.node.tags).map(k => (
          <Amenity
            key={k}
            label={k}
            value={mapFileImage(props.node.tags[k as never])}
          />
        ))}
      </View>
    </BottomSheet>
  );
};

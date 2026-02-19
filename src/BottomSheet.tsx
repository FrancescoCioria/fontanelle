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
import { useAppStore } from "./store";

import "react-spring-bottom-sheet/dist/style.css";

const Amenity = (props: { label: string; value: string }): JSX.Element => {
  const clickable = props.value.startsWith("https://");
  return (
    <View style={{ marginTop: 16 }} column>
      <span style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
        {capitalize(props.label.replace("toilets:", ""))}
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

const mapFileImage = (v: any) =>
  typeof v === "string" && v.startsWith("File:")
    ? `https://commons.wikimedia.org/wiki/${v.replaceAll(" ", "_")}`
    : v;

export default () => {
  const node = useAppStore(s => s.openedNode)!;
  const setOpenedNode = useAppStore(s => s.setOpenedNode);
  const setUpsertNode = useAppStore(s => s.setUpsertNode);

  const [isOpen, updateOpen] = useState(true);

  const [fetchedNode, updateFetchedNode] = useState<
    (OpenStreetMapNode & { timestamp: string; user: string }) | null
  >(null);

  useEffect(() => {
    updateOpen(true);
    osmGetNode(node)
      .then(res => updateFetchedNode(res))
      .catch(() => {});
  }, [node]);

  const openUrl = (url: string) => window.open(url, "_blank");

  return (
    <BottomSheet
      style={{ borderRadius: 40 }}
      open={isOpen}
      onDismiss={() => updateOpen(false)}
      onSpringEnd={() => !isOpen && setOpenedNode(null)}
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
          {getAmenityMarker(node.tags, 48)}
          <span style={{ marginLeft: 16, fontSize: 24 }}>
            {getAmenityTitle(node.tags.amenity)}
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
                `https://www.google.com/maps/dir//${node.lat},${node.lon}`
              )
            }
          />

          {node.tags.mapillary && (
            <Button
              style={{ flexGrow: 1, marginLeft: 16 }}
              label="See street view"
              onClick={() => openUrl(node.tags.mapillary!)}
            />
          )}

          <Button
            style={{ flexGrow: 1, marginLeft: 16 }}
            label="Edit node"
            onClick={() => {
              setUpsertNode({ type: "update", node });
              setOpenedNode(null);
            }}
          />
        </View>

        {fetchedNode && (
          <Amenity label="Last update" value={fetchedNode.timestamp} />
        )}
        {fetchedNode && <Amenity label="Created by" value={fetchedNode.user} />}

        {Object.keys(node.tags).map(k => (
          <Amenity
            key={k}
            label={k}
            value={mapFileImage(node.tags[k as never])}
          />
        ))}
      </View>
    </BottomSheet>
  );
};

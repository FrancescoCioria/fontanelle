import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import {
  getAmenityMarker,
  getAmenityTitle,
  OpenStreetMapNode
} from "./getOpenStreetMapAmenities";
import { Button } from "./form";
import capitalize from "lodash/capitalize";
import { osmGetNode } from "./osm";
import { useAppStore } from "./store";

const snapPoints = [0.45, 0.85];

const Amenity = (props: { label: string; value: string }): JSX.Element => {
  const clickable = props.value.startsWith("https://");
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
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
    </div>
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
  const [snap, setSnap] = useState<number | string | null>(snapPoints[0]);

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
    <Drawer.Root
      open={isOpen}
      onOpenChange={open => {
        updateOpen(open);
      }}
      onAnimationEnd={open => {
        if (!open) setOpenedNode(null);
      }}
      snapPoints={snapPoints}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      dismissible={true}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.4)"
          }}
        />
        <Drawer.Content
          aria-describedby={undefined}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "white",
            borderTopLeftRadius: 40,
            borderTopRightRadius: 40,
            outline: "none"
          }}
        >
          <Drawer.Title style={{ position: "absolute", left: -9999 }}>
            {getAmenityTitle(node.tags.amenity)}
          </Drawer.Title>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              padding: 32,
              paddingTop: 12,
              minHeight: "35vh",
              overflowY: snap === snapPoints[1] ? "auto" : "hidden"
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              {getAmenityMarker(node.tags, 48)}
              <span style={{ marginLeft: 16, fontSize: 24 }}>
                {getAmenityTitle(node.tags.amenity)}
              </span>
            </div>

            <div
              style={{
                display: "flex",
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
            </div>

            {fetchedNode && (
              <Amenity label="Last update" value={fetchedNode.timestamp} />
            )}
            {fetchedNode && (
              <Amenity label="Created by" value={fetchedNode.user} />
            )}

            {Object.keys(node.tags).map(k => (
              <Amenity
                key={k}
                label={k}
                value={mapFileImage(node.tags[k as never])}
              />
            ))}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

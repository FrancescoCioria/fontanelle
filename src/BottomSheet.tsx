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

const Amenity = (props: { label: string; value: string }): JSX.Element => {
  const clickable = props.value.startsWith("https://");
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 4,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.03em"
        }}
      >
        {capitalize(props.label.replace("toilets:", ""))}
      </span>
      {clickable ? (
        <a
          href={props.value}
          target="_blank"
          style={{
            fontSize: 15,
            wordBreak: "break-all",
            color: "#0ea5e9"
          }}
        >
          {props.value}
        </a>
      ) : (
        <span style={{ fontSize: 15, wordBreak: "break-all", color: "#1e293b" }}>
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

  const [isOpen, updateOpen] = useState(false);

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
        if (!open) setTimeout(() => setOpenedNode(null), 300);
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)"
          }}
        />
        <Drawer.Content
          aria-describedby={undefined}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 10001,
            maxHeight: "85vh",
            backgroundColor: "white",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            outline: "none",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 -4px 30px rgba(0, 0, 0, 0.1)"
          }}
        >
          <Drawer.Title style={{ position: "absolute", left: -9999 }}>
            {getAmenityTitle(node.tags.amenity)}
          </Drawer.Title>

          {/* Drag handle */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "12px 0 4px"
            }}
          >
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#d1d5db"
              }}
            />
          </div>

          <div
            style={{
              padding: "8px 24px 32px",
              overflowY: "auto",
              flex: 1,
              WebkitOverflowScrolling: "touch"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 16
              }}
            >
              {getAmenityMarker(node.tags, 44)}
              <span
                style={{
                  marginLeft: 14,
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#1e293b"
                }}
              >
                {getAmenityTitle(node.tags.amenity)}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                padding: "16px 0",
                borderTop: "1px solid #e2e8f0",
                borderBottom: "1px solid #e2e8f0"
              }}
            >
              <Button
                style={{ flex: 1 }}
                variant="primary"
                label="Directions"
                onClick={() =>
                  openUrl(
                    `https://www.google.com/maps/dir//${node.lat},${node.lon}`
                  )
                }
              />

              {node.tags.mapillary && (
                <Button
                  style={{ flex: 1 }}
                  label="Street view"
                  onClick={() => openUrl(node.tags.mapillary!)}
                />
              )}

              <Button
                style={{ flex: 1 }}
                label="Edit"
                onClick={() => {
                  setUpsertNode({ type: "update", node });
                  setOpenedNode(null);
                }}
              />
            </div>

            {fetchedNode ? (
              <>
                <Amenity label="Last update" value={fetchedNode.timestamp} />
                <Amenity label="Created by" value={fetchedNode.user} />
              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 16,
                  gap: 12
                }}
              >
                <div
                  style={{
                    background: "#f1f5f9",
                    borderRadius: 6,
                    height: 16,
                    width: "60%"
                  }}
                />
                <div
                  style={{
                    background: "#f1f5f9",
                    borderRadius: 6,
                    height: 16,
                    width: "40%"
                  }}
                />
              </div>
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

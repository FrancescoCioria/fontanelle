import * as React from "react";
import { Popup } from "./Popup";
import {
  getAmenityTitle,
  OpenStreetMapNode
} from "./getOpenStreetMapAmenities";
import { osmAuth, osmCreateNode, osmDeleteNode, osmUpdateNode } from "./osm";
import { Select, Input, Button } from "./form";
import { useAppStore } from "./store";

export type UpsertNode =
  | {
      type: "create_without_coordinates";
      node: Omit<OpenStreetMapNode, "id" | "lat" | "lon">;
    }
  | {
      type: "create";
      node: Omit<OpenStreetMapNode, "id">;
    }
  | {
      type: "update";
      node: OpenStreetMapNode;
    }
  | {
      type: "update_without_coordinates";
      node: Omit<OpenStreetMapNode, "lat" | "lon">;
    };

type Props = {
  map: mapboxgl.Map;
  onDone: (
    node: OpenStreetMapNode,
    action: "create" | "update" | "delete"
  ) => void;
};

export const UpsertNodePopup = (props: Props) => {
  const initialUpsertNode = useAppStore(s => s.upsertNode)!;
  const setUpsertNode = useAppStore(s => s.setUpsertNode);

  const [state, updateState] = React.useState<UpsertNode>(initialUpsertNode);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const close = () => setUpsertNode(null);

  const editNodeTag = (tag: string, value: string) => {
    const tags: OpenStreetMapNode["tags"] = {
      ...state.node.tags,
      [tag]: value || null
    };

    updateState({
      ...state,
      node: {
        ...state.node,
        tags
      } as never
    });
  };

  const getForm = () => {
    const node = state.node;

    return (
      <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <Button
          label="Change Position"
          onClick={() => {
            if (state.type === "create") {
              updateState({
                type: "create_without_coordinates",
                node: {
                  ...state.node
                }
              });
            } else if (state.type === "update") {
              updateState({
                type: "update_without_coordinates",
                node: {
                  ...state.node
                }
              });
            }
          }}
        />

        <Select
          value={node.tags.indoor}
          label="Indoor"
          onChange={v => editNodeTag("indoor", v)}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" }
          ]}
        />

        {(node.tags.amenity === "toilets" ||
          node.tags.amenity === "shower" ||
          node.tags.amenity === "public_bath") && (
          <Select
            value={node.tags.access === "public" ? "yes" : node.tags.access}
            label="Access"
            onChange={v => editNodeTag("access", v)}
            options={[
              { value: "unknown", label: "Unknown" },
              { value: "yes", label: "Yes" },
              { value: "permissive", label: "Permissive" },
              { value: "customers", label: "Customers" }
            ]}
          />
        )}

        {(node.tags.amenity === "toilets" ||
          node.tags.amenity === "shower" ||
          node.tags.amenity === "public_bath") && (
          <Select
            value={node.tags.fee}
            label="Fee"
            onChange={v => editNodeTag("fee", v)}
            options={[
              { value: "unknown", label: "Unknown" },
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" }
            ]}
          />
        )}

        {(node.tags.amenity === "toilets" ||
          node.tags.amenity === "shower" ||
          node.tags.amenity === "public_bath") &&
        node.tags.fee === "yes" ? (
          <Input
            value={node.tags.charge}
            label="Fee Amount"
            onChange={v => editNodeTag("charge", v)}
          />
        ) : (
          <div />
        )}

        {node.tags.amenity === "toilets" && (
          <Select
            value={node.tags.unisex}
            label="Gender"
            onChange={v => editNodeTag("unisex", v)}
            options={[
              { value: "yes", label: "Yes" },
              { value: "male", label: "Male" },
              { value: "female", label: "Female" }
            ]}
          />
        )}

        {node.tags.amenity === "toilets" && (
          <Select
            value={node.tags.changing_table}
            label="Changing Table"
            onChange={v => editNodeTag("changing_table", v)}
            options={[
              { value: "unknown", label: "Unknown" },
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" }
            ]}
          />
        )}

        {node.tags.amenity === "shower" && (
          <Select
            value={node.tags.hot_water}
            label="Hot Water"
            onChange={v => editNodeTag("hot_water", v)}
            options={[
              { value: "unknown", label: "Unknown" },
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" }
            ]}
          />
        )}

        {(node.tags.amenity === "toilets" ||
          node.tags.amenity === "shower") && (
          <Select
            value={node.tags.wheelchair}
            label="Wheelchair"
            onChange={v => editNodeTag("wheelchair", v)}
            options={[
              { value: "unknown", label: "Unknown" },
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
              { value: "limited", label: "Limited" }
            ]}
          />
        )}

        {node.tags.amenity === "toilets" && (
          <Select
            value={node.tags["toilets:disposal"]}
            label="Disposal"
            onChange={v => editNodeTag("toilets:disposal", v)}
            options={[
              { value: "flush", label: "Flush" },
              { value: "chemical", label: "Chemical" },
              { value: "pitlatrine", label: "Pit latrine" }
            ]}
          />
        )}
      </div>
    );
  };

  if (osmAuth.authenticated()) {
    switch (state.type) {
      case "create_without_coordinates":
      case "update_without_coordinates": {
        return (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexGrow: 1,
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 99999,
                pointerEvents: "none",
                fontSize: 24
              }}
            >
              ✕
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 66,
                zIndex: 99999
              }}
            >
              <div
                style={{
                  display: "flex",
                  paddingTop: 16,
                  paddingBottom: 16,
                  paddingRight: 48,
                  paddingLeft: 48,
                  borderRadius: 8,
                  background: "rgba(0, 0, 0, 0.1)"
                }}
              >
                <Button
                  label="Cancel"
                  style={{ marginRight: 32 }}
                  onClick={close}
                />

                <Button
                  label="Confirm"
                  onClick={() => {
                    const coordinates = {
                      lat: props.map.getCenter().lat,
                      lon: props.map.getCenter().lng
                    };
                    if (state.type === "create_without_coordinates") {
                      updateState({
                        type: "create",
                        node: {
                          ...state.node,
                          ...coordinates
                        }
                      });
                    } else {
                      updateState({
                        type: "update",
                        node: {
                          ...state.node,
                          ...coordinates
                        }
                      });
                    }
                  }}
                />
              </div>
            </div>
          </>
        );
      }

      case "create":
      case "update": {
        return (
          <Popup onClose={close} isOpen={true}>
            <h2 style={{ margin: 0, textAlign: "center" }}>
              {getAmenityTitle(state.node.tags.amenity)}
            </h2>

            <div
              style={{ display: "flex", margin: "16px 0 24px" }}
              className="separator"
            />

            {getForm()}

            <div
              style={{ display: "flex", marginTop: 32 }}
              className="separator"
            />

            {error && (
              <div
                style={{
                  marginTop: 16,
                  padding: "8px 12px",
                  background: "#ffebee",
                  color: "#d32f2f",
                  borderRadius: 4,
                  fontSize: 14
                }}
              >
                {error}
              </div>
            )}

            <Button
              label={loading ? "Saving..." : "Save on OSM"}
              style={{
                marginTop: 24,
                background: "#24A0ED",
                opacity: loading ? 0.6 : 1
              }}
              onClick={() => {
                if (loading) return;
                setLoading(true);
                setError(null);

                const promise =
                  state.type === "create"
                    ? osmCreateNode({ ...state.node }).then(n =>
                        props.onDone(n, "create")
                      )
                    : osmUpdateNode({ ...state.node }).then(n =>
                        props.onDone(n, "update")
                      );

                promise.catch(() => {
                  setError("Failed to save. Please try again.");
                  setLoading(false);
                });
              }}
            />

            {state.type === "update" && (
              <>
                <div
                  style={{ display: "flex", marginTop: 32 }}
                  className="separator"
                />

                <Button
                  label={loading ? "Deleting..." : "Delete from OSM"}
                  style={{
                    marginTop: 24,
                    background: "#f44336",
                    color: "white",
                    opacity: loading ? 0.6 : 1
                  }}
                  onClick={() => {
                    if (loading) return;
                    setLoading(true);
                    setError(null);

                    osmDeleteNode({ ...state.node })
                      .then(n => props.onDone(n, "delete"))
                      .catch(() => {
                        setError("Failed to delete. Please try again.");
                        setLoading(false);
                      });
                  }}
                />
              </>
            )}
          </Popup>
        );
      }
    }
  } else {
    // user is not logged in OSM
    return (
      <Popup onClose={close} isOpen={true}>
        <h2>
          You need to be logged into Open Street Maps to add and edit nodes
        </h2>

        <Button
          label="Log in OSM"
          style={{
            marginTop: 48,
            marginLeft: "auto",
            flexShrink: 0
          }}
          onClick={() => {
            osmAuth.authenticate(() => {
              updateState({ ...state });
            });
          }}
        />
      </Popup>
    );
  }
};

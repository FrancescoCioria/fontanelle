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

        {/* ⚠️ No `name` field, deliberately. In OSM `name` is the proper name,
            not a description, and 93% of playgrounds correctly have none
            (Overpass 2026-08-10: 729 named of 10,457 Italian nodes). An empty
            text box at the top of the form asks a question whose right answer
            is silence, and the answers already in OSM show what gets typed
            instead: 74 of those 729 are just "Parco giochi" / "Parchetto".
            A real name still survives an edit — the write path sends the whole
            tag set back, the form simply doesn't invite touching it. */}
        <Select
          value={node.tags.indoor}
          label="Indoor"
          onChange={v => editNodeTag("indoor", v)}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" }
          ]}
        />

        {node.tags.amenity === "playground" && (
          <Select
            value={node.tags.access === "public" ? "yes" : node.tags.access}
            label="Access"
            onChange={v => editNodeTag("access", v)}
            options={[
              { value: "unknown", label: "Unknown" },
              { value: "yes", label: "Yes" },
              { value: "permissive", label: "Permissive" },
              { value: "private", label: "Private" }
            ]}
          />
        )}

        {node.tags.amenity === "playground" && (
          <Select
            value={node.tags.fenced}
            label="Fenced"
            onChange={v => editNodeTag("fenced", v)}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" }
            ]}
          />
        )}

        {node.tags.amenity === "playground" && (
          <Select
            value={node.tags.lit}
            label="Lit"
            onChange={v => editNodeTag("lit", v)}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" }
            ]}
          />
        )}

        {node.tags.amenity === "playground" && (
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

        {node.tags.amenity === "playground" && (
          <Select
            value={node.tags.surface}
            label="Surface"
            onChange={v => editNodeTag("surface", v)}
            options={[
              { value: "sand", label: "Sand" },
              { value: "rubber", label: "Rubber" },
              { value: "woodchips", label: "Woodchips" },
              { value: "grass", label: "Grass" },
              { value: "asphalt", label: "Asphalt" },
              { value: "paving_stones", label: "Paving stones" },
              { value: "dirt", label: "Dirt" }
            ]}
          />
        )}

        {/* free text, not a number: OSM writes ranges and the app must not
            narrow what it can read back */}
        {node.tags.amenity === "playground" && (
          <Input
            value={node.tags.min_age}
            label="Minimum Age"
            onChange={v => editNodeTag("min_age", v)}
          />
        )}

        {node.tags.amenity === "playground" && (
          <Input
            value={node.tags.max_age}
            label="Maximum Age"
            onChange={v => editNodeTag("max_age", v)}
          />
        )}

        {node.tags.amenity === "elevator" && (
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

        {/* free text: OSM writes lists of floors like `-1;0;1`, so this must
            not be narrowed to a number */}
        {node.tags.amenity === "elevator" && (
          <Input
            value={node.tags.level}
            label="Floors Served"
            onChange={v => editNodeTag("level", v)}
          />
        )}

        {node.tags.amenity === "elevator" && (
          <Input
            value={node.tags.ref}
            label="Lift Reference"
            onChange={v => editNodeTag("ref", v)}
          />
        )}

        {node.tags.amenity === "elevator" && (
          <Select
            value={node.tags.access === "public" ? "yes" : node.tags.access}
            label="Access"
            onChange={v => editNodeTag("access", v)}
            options={[
              { value: "unknown", label: "Unknown" },
              { value: "yes", label: "Yes" },
              { value: "permissive", label: "Permissive" },
              { value: "private", label: "Private" }
            ]}
          />
        )}

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

        {/* playground included: the marker paints gold on a fee and grey on a
            restricted access, so a form that can't set them can't produce the
            states the map already knows how to show */}
        {(node.tags.amenity === "toilets" ||
          node.tags.amenity === "shower" ||
          node.tags.amenity === "public_bath" ||
          node.tags.amenity === "playground" ||
          node.tags.amenity === "elevator") && (
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
          node.tags.amenity === "public_bath" ||
          node.tags.amenity === "playground" ||
          node.tags.amenity === "elevator") &&
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
                zIndex: 10000,
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
                zIndex: 10000
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "14px 32px",
                  borderRadius: 16,
                  background: "rgba(255, 255, 255, 0.95)",
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.12)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)"
                }}
              >
                <Button
                  label="Cancel"
                  onClick={close}
                />

                <Button
                  label="Confirm"
                  variant="primary"
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
                role="alert"
                style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  background: "#fef2f2",
                  color: "#dc2626",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 500
                }}
              >
                {error}
              </div>
            )}

            <Button
              label={loading ? "Saving..." : "Save on OSM"}
              variant="primary"
              style={{
                marginTop: 24,
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

                promise.catch((e: Error) => {
                  // the server forwards what OSM actually said (version
                  // conflict, expired token, …); "please try again" on a 409
                  // just sends the user round the same loop
                  setError(e?.message || "Failed to save. Please try again.");
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
                  variant="danger"
                  style={{
                    marginTop: 24,
                    opacity: loading ? 0.6 : 1
                  }}
                  onClick={() => {
                    if (loading) return;
                    setLoading(true);
                    setError(null);

                    osmDeleteNode({ ...state.node })
                      .then(n => props.onDone(n, "delete"))
                      .catch((e: Error) => {
                        setError(
                          e?.message || "Failed to delete. Please try again."
                        );
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
          variant="primary"
          style={{
            marginTop: 32,
            flexShrink: 0
          }}
          onClick={() => {
            osmAuth.authenticate((err: any) => {
              if (err) {
                useAppStore.getState().setErrorMessage("OSM login failed. Please try again.");
              } else {
                updateState({ ...state });
              }
            });
          }}
        />
      </Popup>
    );
  }
};

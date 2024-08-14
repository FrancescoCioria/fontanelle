import * as React from "react";
import View from "react-flexview";
import { Popup } from "./Popup";
import {
  getAmenityTitle,
  OpenStreetMapNode
} from "./getOpenStreetMapAmenities";
import { osmAuth, osmCreateNode, osmDeleteNode, osmUpdateNode } from "./osm";
import { Select, Input, Button } from "./form";

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
  onClose: () => void;
  onDone: (
    node: OpenStreetMapNode,
    action: "create" | "update" | "delete"
  ) => void;
} & UpsertNode;

export const UpsertNodePopup = (props: Props) => {
  const [state, updateState] = React.useState<UpsertNode>(props);

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
      <View column shrink={false}>
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
      </View>
    );
  };

  if (osmAuth.authenticated()) {
    switch (state.type) {
      case "create_without_coordinates":
      case "update_without_coordinates": {
        return (
          <>
            <View
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 99999,
                pointerEvents: "none",
                fontSize: 24
              }}
              vAlignContent="center"
              hAlignContent="center"
              grow
            >
              ✕
            </View>

            <View
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 66,
                zIndex: 99999
              }}
              vAlignContent="center"
              hAlignContent="center"
            >
              <View
                style={{
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
                  onClick={props.onClose}
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
              </View>
            </View>
          </>
        );
      }

      case "create":
      case "update": {
        return (
          <Popup onClose={props.onClose} isOpen={true}>
            <h2 style={{ margin: 0, textAlign: "center" }}>
              {getAmenityTitle(props.node.tags.amenity)}
            </h2>

            <View style={{ margin: "16px 0 24px" }} className="separator" />

            {getForm()}

            <View style={{ marginTop: 32 }} className="separator" />

            <Button
              label="Save on OSM"
              style={{
                marginTop: 24,
                background: "#24A0ED"
              }}
              onClick={() => {
                if (state.type === "create") {
                  // create
                  osmCreateNode({ ...state.node }).then(n =>
                    props.onDone(n, "create")
                  );
                } else {
                  // update
                  osmUpdateNode({ ...state.node }).then(n =>
                    props.onDone(n, "update")
                  );
                }
              }}
            />

            {state.type === "update" && (
              <>
                <View style={{ marginTop: 32 }} className="separator" />

                <Button
                  label="Delete from OSM"
                  style={{
                    marginTop: 24,
                    background: "#f44336",
                    color: "white"
                  }}
                  onClick={() => {
                    osmDeleteNode({ ...state.node }).then(n =>
                      props.onDone(n, "delete")
                    );
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
      <Popup onClose={props.onClose} isOpen={true}>
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

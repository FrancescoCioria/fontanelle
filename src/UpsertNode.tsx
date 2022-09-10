import * as React from "react";
import View from "react-flexview";
import { Popup } from "./Popup";
import { OpenStreetMapNode } from "./getOpenStreetMapAmenities";
import { osmAuth, osmCreateNode, osmUpdateNode } from "./osm";

type Option<V extends string> = {
  value: V | null;
  label: string;
};

const Select = <V extends string>(props: {
  value?: V;
  label: string;
  onChange: (value: V) => void;
  options: Option<V>[];
}) => {
  return (
    <View column className="select" shrink={false}>
      <span className="select-label">{props.label}</span>
      <select
        value={props.value}
        onChange={e => props.onChange(e.currentTarget.value as V)}
      >
        <option value="">Select an option</option>
        {props.options.map(o => (
          <option key={o.value} value={o.value || ""}>
            {o.label}
          </option>
        ))}
      </select>
    </View>
  );
};

const Input = (props: {
  value?: string;
  label: string;
  onChange: (value: string) => void;
}) => {
  return (
    <View column className="input" shrink={false}>
      <span className="input-label">{props.label}</span>
      <input
        value={props.value || ""}
        onChange={e => props.onChange(e.currentTarget.value)}
      />
    </View>
  );
};

export const UpsertNodePopup = (props: {
  map: mapboxgl.Map;
  node: Omit<OpenStreetMapNode, "id"> & { id: number | null };
  onClose: () => void;
  onDone: () => void;
}) => {
  const [node, updateNode] = React.useState({ ...props.node });

  const editNodeTag = (tag: string, value: string) => {
    updateNode({
      ...node,
      tags: {
        ...node.tags,
        [tag]: value || null
      }
    });
  };

  const getForm = () => {
    return (
      <View column shrink={false}>
        {(node.tags.amenity === "toilets" ||
          node.tags.amenity === "shower") && (
          <Select
            value={node.tags.access === "public" ? "yes" : node.tags.access}
            label="Access"
            onChange={v => editNodeTag("access", v)}
            options={[
              { value: "unknown", label: "Unknown" },
              { value: "yes", label: "Yes" },
              { value: "permissive", label: "Permissive" }
            ]}
          />
        )}

        {(node.tags.amenity === "toilets" ||
          node.tags.amenity === "shower") && (
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

        {(node.tags.amenity === "toilets" || node.tags.amenity === "shower") &&
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
      </View>
    );
  };

  const getTitle = (): string => {
    switch (props.node.tags.amenity) {
      case "drinking_water":
        return "Drinking Water";
      case "toilets":
        return "Toilets";
      case "shower":
        return "Shower";
    }
  };

  if (osmAuth.authenticated() && node.lat === 0 && node.lon === 0) {
    // node needs positioning

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
            <button
              style={{ cursor: "pointer", height: 40, marginRight: 32 }}
              onClick={props.onClose}
            >
              Cancel
            </button>
            <button
              style={{ cursor: "pointer", height: 40 }}
              onClick={() => {
                updateNode({
                  ...node,
                  lat: props.map.getCenter().lat,
                  lon: props.map.getCenter().lng
                });
              }}
            >
              Confirm
            </button>
          </View>
        </View>
      </>
    );
  } else if (osmAuth.authenticated()) {
    // node is positioned and ready to be updated/created
    return (
      <Popup onClose={props.onClose} isOpen={true}>
        <h2>{getTitle()}</h2>

        {getForm()}

        <button
          style={{
            marginTop: 48,
            height: 40,
            width: 200,
            marginLeft: "auto",
            flexShrink: 0
          }}
          onClick={() => {
            if (node.id === null) {
              // create
              osmCreateNode({ ...node }).then(() => props.onDone());
            } else {
              // update
              osmUpdateNode({ ...node, id: node.id }).then(() =>
                props.onDone()
              );
            }
          }}
        >
          Save on OSM
        </button>
      </Popup>
    );
  } else {
    // user is not logged in OSM
    return (
      <Popup onClose={props.onClose} isOpen={true}>
        <h2>
          You need to be logged into Open Street Maps to add and edit nodes
        </h2>

        <button
          style={{
            marginTop: 48,
            height: 40,
            width: 200,
            marginLeft: "auto",
            flexShrink: 0
          }}
          onClick={() => {
            osmAuth.authenticate(() => {
              updateNode({ ...node });
            });
          }}
        >
          Log in OSM
        </button>
      </Popup>
    );
  }
};

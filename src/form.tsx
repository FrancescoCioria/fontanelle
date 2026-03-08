import * as React from "react";

type Option<V extends string> = {
  value: V | null;
  label: string;
};

export const Select = <V extends string>(props: {
  value?: V;
  label: string;
  onChange: (value: V) => void;
  options: Option<V>[];
}) => {
  return (
    <div
      className="select"
      style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}
    >
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
    </div>
  );
};

export const Input = (props: {
  value?: string;
  label: string;
  onChange: (value: string) => void;
}) => {
  return (
    <div
      className="input"
      style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}
    >
      <span className="input-label">{props.label}</span>
      <input
        value={props.value || ""}
        onChange={e => props.onChange(e.currentTarget.value)}
      />
    </div>
  );
};

export const Checkbox = (props: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) => (
  <div
    className="checkbox"
    style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
    onClick={() => props.onChange(!props.value)}
  >
    <input
      checked={props.value}
      type="checkbox"
      onChange={e => {
        props.onChange(e.currentTarget.checked);
      }}
    />
    <span className="checkbox-label">{props.label}</span>
  </div>
);

export const Button = (props: {
  label: string;
  onClick: () => void;
  style?: React.CSSProperties;
  variant?: "default" | "primary" | "danger";
  icon?: React.ReactNode;
}) => {
  const variant = props.variant || "default";
  const className =
    variant === "primary"
      ? "button button-primary"
      : variant === "danger"
        ? "button button-danger"
        : "button";

  return (
    <button className={className} style={props.style} onClick={props.onClick}>
      {props.icon && <span style={{ display: "flex", flexShrink: 0 }}>{props.icon}</span>}
      {props.label}
    </button>
  );
};

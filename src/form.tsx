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
  const id = React.useId();
  return (
    <div
      className="select"
      style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}
    >
      <label className="select-label" htmlFor={id}>{props.label}</label>
      <select
        id={id}
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
  const id = React.useId();
  return (
    <div
      className="input"
      style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}
    >
      <label className="input-label" htmlFor={id}>{props.label}</label>
      <input
        id={id}
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
}) => {
  const id = React.useId();
  return (
    <label
      className="checkbox"
      htmlFor={id}
      style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
    >
      <input
        id={id}
        checked={props.value}
        type="checkbox"
        onChange={e => props.onChange(e.currentTarget.checked)}
      />
      <span className="checkbox-label">{props.label}</span>
    </label>
  );
};

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
      {props.icon}
      {props.label}
    </button>
  );
};

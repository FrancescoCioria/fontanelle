import * as React from "react";
import View from "react-flexview";

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

export const Input = (props: {
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

export const Checkbox = (props: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) => (
  <View
    className="checkbox"
    vAlignContent="center"
    onClick={() => props.onChange(!props.value)}
    shrink={false}
  >
    <input
      checked={props.value}
      type="checkbox"
      onChange={e => {
        props.onChange(e.currentTarget.checked);
      }}
    />
    <span className="checkbox-label">{props.label}</span>
  </View>
);

export const Button = (props: {
  label: string;
  onClick: () => void;
  style?: React.CSSProperties;
}) => {
  return (
    <button className="button" style={props.style} onClick={props.onClick}>
      {props.label}
    </button>
  );
};

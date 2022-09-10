import * as React from "react";
import View from "react-flexview";

export const Popup = (props: {
  children: JSX.Element | false | null | Array<JSX.Element | false | null>;
  onClose: () => void;
  isOpen: boolean;
  style?: React.CSSProperties;
}) => {
  return (
    <View
      className="popup"
      style={{
        ...props.style,
        display: props.isOpen ? "flex" : "none"
      }}
      hAlignContent="center"
      vAlignContent="center"
      onClick={e => {
        e.stopPropagation();
        props.onClose();
      }}
      shrink={false}
    >
      <View
        className="popup-content"
        column
        onClick={e => {
          e.stopPropagation();
        }}
      >
        {props.children}
      </View>
    </View>
  );
};

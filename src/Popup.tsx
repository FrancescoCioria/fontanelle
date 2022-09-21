import * as React from "react";
import View from "react-flexview";

export const Popup = (props: {
  children: View.Props["children"];
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

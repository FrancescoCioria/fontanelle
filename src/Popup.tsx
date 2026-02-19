import * as React from "react";

export const Popup = (props: {
  children: React.ReactNode;
  onClose: () => void;
  isOpen: boolean;
  style?: React.CSSProperties;
}) => {
  return (
    <div
      className="popup"
      style={{
        ...props.style,
        display: props.isOpen ? "flex" : "none",
        justifyContent: "center",
        alignItems: "center",
        flexShrink: 0
      }}
      onClick={e => {
        e.stopPropagation();
        props.onClose();
      }}
    >
      <div
        className="popup-content"
        style={{ display: "flex", flexDirection: "column" }}
        onClick={e => {
          e.stopPropagation();
        }}
      >
        {props.children}
      </div>
    </div>
  );
};

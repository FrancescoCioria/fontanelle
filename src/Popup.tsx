import * as React from "react";

export const Popup = (props: {
  children: React.ReactNode;
  onClose: () => void;
  isOpen: boolean;
  style?: React.CSSProperties;
  "aria-label"?: string;
}) => {
  const onCloseRef = React.useRef(props.onClose);
  onCloseRef.current = props.onClose;

  React.useEffect(() => {
    if (!props.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [props.isOpen]);

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
        role="dialog"
        aria-modal="true"
        aria-label={props["aria-label"]}
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

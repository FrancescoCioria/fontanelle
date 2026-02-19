import React, { FC, useEffect } from "react";
import * as serviceWorker from "./serviceWorkerRegistration";

// Learn more about service workers: https://bit.ly/CRA-PWA

const ServiceWorkerWrapper: FC = () => {
  const [showReload, setShowReload] = React.useState(false);
  const [waitingWorker, setWaitingWorker] =
    React.useState<ServiceWorker | null>(null);

  const onSWUpdate = (registration: ServiceWorkerRegistration) => {
    setShowReload(true);
    setWaitingWorker(registration.waiting);
  };

  useEffect(() => {
    serviceWorker.register({ onUpdate: onSWUpdate });
  }, []);

  const reloadPage = () => {
    console.log("reload page");
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    setShowReload(false);
    window.location.reload();
  };

  return showReload ? (
    <div
      className="updateAvailable"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "lightgreen",
        height: 40,
        color: "black",
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999999999999
      }}
    >
      Update Available:
      <span
        style={{
          marginLeft: 32,
          textDecoration: "underline",
          cursor: "pointer"
        }}
        onClick={() => reloadPage()}
      >
        Install
      </span>
      <span
        style={{
          marginLeft: 32,
          textDecoration: "underline",
          cursor: "pointer"
        }}
        onClick={() => {
          console.log("ignore");
          setShowReload(false);
        }}
      >
        Ignore
      </span>
    </div>
  ) : null;
};

export default ServiceWorkerWrapper;

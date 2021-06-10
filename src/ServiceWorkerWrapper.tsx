import React, { FC, useEffect } from "react";
import * as serviceWorker from "./serviceWorkerRegistration";
import View from "react-flexview";
import { none, Option, fromNullable, map } from "fp-ts/lib/Option";

// Learn more about service workers: https://bit.ly/CRA-PWA

const ServiceWorkerWrapper: FC = () => {
  const [showReload, setShowReload] = React.useState(false);
  const [waitingWorker, setWaitingWorker] =
    React.useState<Option<ServiceWorker>>(none);

  const onSWUpdate = (registration: ServiceWorkerRegistration) => {
    setShowReload(true);
    setWaitingWorker(fromNullable(registration.waiting));
  };

  useEffect(() => {
    serviceWorker.register({ onUpdate: onSWUpdate });
  }, []);

  const reloadPage = () => {
    console.log("reload page");
    map<ServiceWorker, void>(ww => ww.postMessage({ type: "SKIP_WAITING" }))(
      waitingWorker
    );
    setShowReload(false);
    window.location.reload();
  };

  return showReload ? (
    <View
      className="updateAvailable"
      vAlignContent="center"
      hAlignContent="center"
      style={{
        background: "lightgreen",
        height: 25,
        color: "black"
      }}
    >
      Update Available
      <span
        style={{
          marginLeft: 60,
          textDecoration: "underline",
          cursor: "pointer"
        }}
        onClick={() => reloadPage()}
      >
        Install
      </span>
      <span
        style={{
          marginLeft: 20,
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
    </View>
  ) : null;
};

export default ServiceWorkerWrapper;

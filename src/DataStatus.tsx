import * as React from "react";
import { useAppStore } from "./store";

/**
 * Says out loud what the map cannot: whether an empty screen means "nothing is
 * mapped here" or "OpenStreetMap didn't answer".
 *
 * ⚠️ This exists because the server is deliberately resilient — it replies 200
 * with whatever it has, failed tiles and all — so from the browser a dead
 * Overpass and an empty countryside look identical. "Nothing here" is only ever
 * shown when the server reports every tile in the area as fresh; anything less
 * certain says so.
 */
const DataStatus = () => {
  const status = useAppStore(s => s.dataStatus);
  const retry = useAppStore(s => s.retryLastSearch);

  if (!status) return null;

  const retryable =
    status.kind === "unreachable" ||
    status.kind === "offline" ||
    (status.kind === "incomplete" && !status.retrying);

  const message = (): string => {
    switch (status.kind) {
      case "incomplete":
        // ⚠️ Deliberately loud about *which* part is unknown. "Loading…" over a
        // map that already shows pins invites the reading "loaded, and that's
        // all there is" — which is exactly the confusion being fixed.
        return status.retrying
          ? status.hasData
            ? "Still loading — parts of this area aren't shown yet"
            : "Loading this area…"
          : "Parts of this area never loaded. Tap to retry.";
      case "unreachable":
        return status.hasData
          ? status.retrying
            ? "Some points are missing — OpenStreetMap isn't responding. Retrying…"
            : "Some points are missing — OpenStreetMap isn't responding. Tap to retry."
          : status.retrying
          ? "OpenStreetMap isn't responding. Retrying…"
          : "Can't reach OpenStreetMap. Tap to retry.";
      case "offline":
        return "You're offline — showing saved points. Tap to retry.";
      case "empty":
        return "Nothing mapped in this area";
    }
  };

  return (
    <div
      className={`data-status data-status--${status.kind}${
        // still trying is news; given up is a problem, and looks like one
        status.kind === "incomplete" && !status.retrying
          ? " data-status--stalled"
          : ""
      }`}
      role="status"
      onClick={() => {
        if (retryable) retry?.();
      }}
      style={{ cursor: retryable ? "pointer" : "default" }}
    >
      {message()}
    </div>
  );
};

export default DataStatus;

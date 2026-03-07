import { useEffect } from "react";
import Map from "./Map";
import ServiceWorkerWrapper from "./ServiceWorkerWrapper";
import { osmAuth } from "./osm";

function App() {
  useEffect(() => {
    if (window.location.search.includes("code=")) {
      osmAuth.authenticate(() => {
        window.history.replaceState({}, "", window.location.pathname);
      });
    }
  }, []);

  return (
    <div
      className="App"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw"
      }}
    >
      <ServiceWorkerWrapper />
      <Map />
    </div>
  );
}

export default App;

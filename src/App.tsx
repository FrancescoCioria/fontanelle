import { useEffect } from "react";
import Map from "./Map";
import ServiceWorkerWrapper from "./ServiceWorkerWrapper";
import { osmAuth } from "./osm";
import { useAppStore } from "./store";

function App() {
  const setErrorMessage = useAppStore(s => s.setErrorMessage);

  useEffect(() => {
    if (window.location.search.includes("code=")) {
      osmAuth.authenticate((err: any) => {
        if (err) {
          setErrorMessage("OSM login failed. Please try again.");
        }
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

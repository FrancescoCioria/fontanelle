import Map from "./Map";
import ServiceWorkerWrapper from "./ServiceWorkerWrapper";

function App() {
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

import Map from "./Map";
import View from "react-flexview";
import ServiceWorkerWrapper from "./ServiceWorkerWrapper";

function App() {
  return (
    <View className="App" style={{ height: "100vh", width: "100vw" }} column>
      <ServiceWorkerWrapper />
      <Map />
    </View>
  );
}

export default App;

(this.webpackJsonpfontanelle=this.webpackJsonpfontanelle||[]).push([[0],{34:function(e,t,n){},41:function(e,t,n){},42:function(e,t,n){"use strict";n.r(t);var a=n(1),o=n.n(a),c=n(4),r=n.n(c),i=n(12),s=n.n(i),d=n(5),h=n.n(d),l=n(2),p=n(0),m=function(e){return Object(p.jsx)("svg",{id:"Layer_1",enableBackground:"new 0 0 512 512",height:"20px",viewBox:"0 0 512 512",width:"20px",fill:e.color||"blue",children:Object(p.jsxs)("g",{children:[Object(p.jsx)("path",{d:"m421.082 355.479c-16.269-24.198-32.288-43.872-32.962-44.698-2.849-3.49-7.115-5.514-11.62-5.514s-8.771 2.024-11.62 5.514c-.674.826-16.693 20.5-32.962 44.698-34.685 51.594-34.685 70.908-34.685 77.255 0 43.708 35.559 79.267 79.267 79.267s79.267-35.559 79.267-79.267c0-6.347 0-25.662-34.685-77.255z"}),Object(p.jsx)("path",{d:"m71.233 64.267h224.934c8.284 0 15-6.716 15-15v-34.267c0-8.284-6.716-15-15-15h-224.934c-8.284 0-15 6.716-15 15v34.267c0 8.284 6.716 15 15 15z"}),Object(p.jsx)("path",{d:"m56.233 159.6v64.267c0 8.284 6.716 15 15 15h19.267v-94.267h-19.267c-8.284 0-15 6.716-15 15z"}),Object(p.jsx)("path",{d:"m329.366 256c0 8.284 6.716 15 15 15h64.268c8.284 0 15-6.716 15-15v-32.133c0-43.708-35.56-79.267-79.268-79.267h-67.466v94.267h52.466z"}),Object(p.jsx)("path",{d:"m231.9 128.533h-1.067v-34.266h-94.267v34.267h-1.066c-8.284 0-15 6.716-15 15v96.4c0 8.284 6.716 15 15 15h96.4c8.284 0 15-6.716 15-15v-96.4c0-8.285-6.715-15.001-15-15.001z"})]})})};n(33),n(34);const u=n(35);u.workerClass=n(36).default;class j extends a.PureComponent{constructor(...e){super(...e),this.map=l.none,this.drinkingWaterNodes={},this.drinkingWaterMarkers=[],this.updateDrinkingWater=s()((()=>{Object(l.map)((e=>{(async e=>{const t='\n    [out:json];\n    (node["amenity"="drinking_water"](around:'.concat(e.around,",").concat(e.lat,",").concat(e.lng,"););\n    out;>;out;\n  ");return fetch("https://overpass-api.de/api/interpreter?data=".concat(t,"&output&cache-only=true")).then((e=>e.json())).then((e=>e.elements))})({around:2e3,lat:e.getCenter().lat,lng:e.getCenter().lng}).then(this.addWaterMarkers)}))(this.map)}),200),this.addWaterMarkers=e=>{Object(l.map)((t=>{e.forEach((e=>{if(!this.drinkingWaterNodes[e.id]){const n=document.createElement("div");c.render(Object(p.jsx)(m,{}),n);const a=new u.Marker({element:n}).setLngLat([e.lon,e.lat]);a.addTo(t),this.drinkingWaterNodes[e.id]=e,this.drinkingWaterMarkers.push(a)}}))}))(this.map)}}initializeMap(){u.accessToken="pk.eyJ1IjoiZnJhbmNlc2NvY2lvcmlhIiwiYSI6ImNqcThyejR6ODA2ZDk0M25rZzZjcGo4ZmcifQ.yRWHQbG1dJjDp43d01bBOw",navigator.geolocation&&navigator.geolocation.getCurrentPosition((e=>{const t=new u.Map({container:"map",style:"mapbox://styles/francescocioria/cjqi3u6lmame92rmw6aw3uyhm?optimize=true",center:{lat:e.coords.latitude,lng:e.coords.longitude},zoom:15,scrollZoom:!1});t.addControl(new u.GeolocateControl({positionOptions:{enableHighAccuracy:!0},trackUserLocation:!0})),t.on("load",(()=>{var e;this.map=Object(l.some)(t),this.updateDrinkingWater(),null===(e=document.querySelector(".mapboxgl-ctrl-geolocate"))||void 0===e||e.click()})),t.on("move",this.updateDrinkingWater)}))}componentDidMount(){this.initializeMap()}componentDidUpdate(){requestAnimationFrame((()=>{Object(l.map)((e=>e.resize()))(this.map)}))}render(){return Object(p.jsx)(h.a,{grow:!0,id:"map"})}}var g=j;var b=function(){return Object(p.jsx)(h.a,{className:"App",style:{height:"100vh",width:"100vw"},children:Object(p.jsx)(g,{})})};n(41);r.a.render(Object(p.jsx)(o.a.StrictMode,{children:Object(p.jsx)(b,{})}),document.getElementById("root"))}},[[42,1,2]]]);
//# sourceMappingURL=main.2a18efce.chunk.js.map
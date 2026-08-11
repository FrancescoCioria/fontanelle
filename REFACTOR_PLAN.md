# Piano di Refactor — Fontanelle

> **Chiuso: tutti e 7 i punti sono Done.** Documento storico, tenuto per il
> perché delle scelte — non è una lista di cose da fare, e le descrizioni del
> codice qui dentro fotografano il febbraio 2026, non com'è oggi. Esempio: i
> «marker con colore dinamico (opening hours, fee, access)» citati ai punti 2 e
> 3 oggi non esistono più così — il fee è un badge (`FeeBadge.tsx`), non un
> colore. Per lo stato attuale vale [CLAUDE.md](./CLAUDE.md).

## 1. Error handling sulle chiamate API
**Stato: Done**

Le chiamate Overpass API e OSM API non hanno gestione errori. Le operazioni CRUD in `UpsertNode.tsx` non hanno `.catch()` — un errore silenzioso può far credere all'utente che il nodo sia stato salvato.

### Cosa fare
- Aggiungere `.catch()` con feedback visivo (toast/banner) sulle chiamate in `getOpenStreetMapAmenities.tsx`
- Aggiungere error handling sulle operazioni OSM in `UpsertNode.tsx` (create/update/delete)
- Implementare retry con backoff per l'Overpass API
- Mostrare stato di errore nell'UI quando la rete è assente

### Pro
- Basso effort, alto impatto sulla robustezza
- L'app è una PWA pensata per uso mobile/offline — gli errori silenziosi sono critici
- Previene stati inconsistenti (utente crede di aver salvato, ma la richiesta è fallita)

### Contro
- Aggiunge complessità UI (componente toast/snackbar)
- L'app già mostra dati cached in assenza di rete, quindi il caso più critico è parzialmente coperto

---

## 2. Eliminare `ReactDOM.render` per i marker
**Stato: Done**

In `Map.tsx:271` ogni marker usa `ReactDOM.render` per montare SVG in un DOM element. Questo è deprecato in React 17 e rimosso in React 18, bloccando l'aggiornamento.

### Cosa fare
- Sostituire `ReactDOM.render` con `renderToStaticMarkup` + `innerHTML` (i marker non hanno stato interno, solo un onClick sul wrapper)
- In alternativa, generare l'SVG come stringa direttamente senza React

### Pro
- Sblocca l'aggiornamento a React 18+
- Elimina un pattern non più supportato
- Semplifica il codice (i marker sono SVG statici)

### Contro
- I marker con colore dinamico (opening hours, fee, access) richiedono comunque un rendering condizionale
- Il click handler va riagganciato manualmente via `element.addEventListener`

---

## 3. Usare Mapbox GL Source/Layer invece di marker DOM individuali
**Stato: Done**

Ogni amenity è un `mapboxgl.Marker` DOM con virtualizzazione manuale (show/hide basata su bounds). Con centinaia di nodi il DOM si appesantisce.

### Cosa fare
- Convertire i nodi in una GeoJSON Source
- Usare un Symbol Layer con icone personalizzate (sprite da SVG)
- Gestire click via `map.on('click', layerId)`
- Rimuovere tutta la logica di virtualizzazione (`showNode`, `hideNode`, `updateMarkersThrottle`)

### Pro
- Mapbox gestisce nativamente viewport culling e clustering
- Performance nettamente migliore (zero DOM elements per marker)
- Elimina ~100 righe di logica di virtualizzazione manuale

### Contro
- Le icone SVG dinamiche (colore basato su opening_hours/fee/access) vanno convertite in sprite/SDF icons
- Il paradigma di click handling cambia completamente
- Refactor significativo di `addAmenitiesMarkers`, `showNode`, `hideNode`

---

## 4. Migrazione da class component a functional component (`Map.tsx`)
**Stato: Done**

`Map.tsx` è un class component di ~600 righe che gestisce tutto lo stato dell'app.

### Cosa fare
- Convertire `MapFountains` in functional component
- Estrarre custom hooks: `useMap`, `useAmenities`, `useFilters`, `useRadius`
- Sostituire `this.nodes` con `useRef`
- Sostituire `this.map` (fp-ts Option) con `useRef<mapboxgl.Map | null>`

### Pro
- Ogni hook diventa testabile e riutilizzabile indipendentemente
- Si allinea col resto dell'app che già usa hooks
- Più leggibile e manutenibile

### Contro
- Refactor ampio, tocca il file più grande e critico dell'app
- La logica imperativa di Mapbox resta comunque imperativa anche con hooks
- Rischio di regressioni sulla virtualizzazione marker e debounce/throttle

---

## 5. Rimuovere `fp-ts` Option
**Stato: Done**

`fp-ts` è una dipendenza pesante (~150KB pre-treeshake), usata solo per `Option<mapboxgl.Map>` in `Map.tsx` e `Option<ServiceWorker>` in `ServiceWorkerWrapper.tsx`.

### Cosa fare
- Sostituire `Option<mapboxgl.Map>` con `mapboxgl.Map | null` + optional chaining
- Sostituire `Option<ServiceWorker>` con `ServiceWorker | null`
- Rimuovere `fp-ts` da `package.json`

### Pro
- Elimina una dipendenza pesante e concettualmente complessa
- Il pattern `getMap(cb)` è già sostanzialmente un custom `map` su Option
- Più semplice per chi contribuisce

### Contro
- Cambiamento minimo di impatto reale dopo tree-shaking
- Se in futuro si volesse adottare FP più estensivamente, rimuoverla sarebbe un passo indietro

---

## 6. Separare lo state management dal componente Map
**Stato: Done**

Tutto lo stato (filtri, raggio, nodi, mappa, popup) vive in un unico class component. I `nodes` sono fuori dallo state React (proprietà di istanza).

### Cosa fare
- Introdurre uno store leggero (Zustand ~1KB, oppure React Context)
- Centralizzare: nodi, filtri, raggio, stato popup/bottomsheet
- BottomSheet e UpsertNode leggono/scrivono direttamente dallo store

### Pro
- Elimina prop drilling
- I `nodes` fuori dallo state React sono un rischio di inconsistenza
- BottomSheet e UpsertNode diventano più autonomi

### Contro
- Aggiunge una dipendenza (o boilerplate con Context)
- Per un'app di questa dimensione potrebbe essere over-engineering
- I nodi sono volutamente fuori dallo state per performance (evitare re-render su centinaia di marker)

---

## 7. Aggiornare le dipendenze core
**Stato: Done**

React 17, TypeScript 4.1, react-scripts 5 con react-app-rewired sono datati.

### Cosa fare
- React 17 → 18+ (richiede prima il punto 2)
- TypeScript 4.1 → 5.x
- `react-scripts` + `react-app-rewired` → Vite
- Verificare compatibilità di `react-spring-bottom-sheet` e `react-flexview` (entrambe non mantenute)

### Pro
- React 18: concurrent features, automatic batching, migliori performance
- TypeScript 5: template literal types migliorati, `satisfies`, bundle più piccolo
- Vite: dev server istantaneo, HMR veloce, elimina `config-overrides.js`

### Contro
- `react-spring-bottom-sheet` potrebbe non essere compatibile con React 18
- `react-flexview` non è mantenuta e potrebbe non funzionare con React 18
- Vite richiede revisione dei polyfill Node (buffer, stream, timers) e del service worker setup

# Fontanelle

Mappa delle risorse pubbliche all'aperto, basata su OpenStreetMap: fontanelle,
bagni pubblici, docce, bagni pubblici storici, stazioni di riparazione bici,
punti di ricarica, parchi giochi, aree picnic e ascensori pubblici.

Il nome è storico — è nata per le sole fontanelle, oggi copre l'outdoor in
generale, con un occhio a chi gira con bambini (parchi giochi, aree picnic,
bagni col fasciatoio, ascensori per il passeggino).

**Live: https://fontanelle.pages.dev**

È una PWA: si installa sul telefono e i dati già scaricati restano consultabili
offline.

## Come funziona

I dati arrivano da OpenStreetMap tramite le istanze pubbliche di Overpass, che
sono lente e spesso mezze fuori uso: il 26/07/2026, dalla Francia, tutte e
quattro rispondevano `504` o dopo più di 17 secondi, e la mappa restava vuota.

Per questo **l'app non parla con Overpass**: parla con un endpoint suo
(`/api/amenities`), un Cloudflare Worker che interroga più istanze Overpass in
parallelo, tiene la prima risposta buona e salva tutto in un database D1. La
zona viene divisa in riquadri fissi, così due persone che guardano la stessa
strada leggono le stesse righe già scaricate: la prima volta ci vogliono
~5 secondi, dopo ~10 millisecondi.

Il browser si limita a disegnare i punti e a filtrarli, e ne tiene una copia
locale per l'uso offline.

Anche le modifiche passano dal server: quando aggiungi o correggi un punto,
è il server a scriverlo su OpenStreetMap e a rileggere il risultato, così la
cache è aggiornata nell'istante in cui la modifica va a buon fine — senza
aspettare che Overpass se ne accorga.

Quando la mappa è vuota te lo dice: distingue «qui non c'è niente» — e lo
afferma solo quando ha davvero tutti i dati della zona — da «OpenStreetMap non
risponde» e da «sei offline, questi sono i punti salvati».

All'apertura si centra sulla tua posizione con una vista larga, in cui entra
tutta l'area che sta cercando; il pulsante della posizione ti porta vicino.

## Sviluppo

```bash
yarn install
yarn build      # build di produzione in dist/ (dev:api serve questa cartella)
yarn dev:api    # Worker + D1 locale su http://localhost:8788
yarn start      # dev server su http://localhost:5173 (proxy /api → :8788)
```

Le due cose vanno in due terminali: `yarn start` da solo non ha le API.
Alla prima esecuzione, per creare le tabelle in locale:

```bash
yarn db:init
```

Serve un token Mapbox in un file `.env` (non versionato):

```
VITE_MAPBOX_TOKEN=pk.xxxxx
```

## Deploy

Cloudflare Pages (build statica + Worker insieme):

```bash
yarn build && yarn deploy
```

Il token Mapbox è anche un secret di Cloudflare Pages (`VITE_MAPBOX_TOKEN`).
Le tabelle sul database di produzione si creano con `yarn db:init:remote`.

Le modifiche fatte dagli utenti (riuscite e fallite) restano registrate: si
leggono con `yarn logs`.

> ⚠️ Il deploy va fatto su `fontanelle.pages.dev` e non altrove: il
> `redirect_uri` OAuth di OpenStreetMap è registrato su quel dominio, quindi su
> qualsiasi altro host il login OSM non funziona.

## Contribuire ai dati

I dati vengono da OpenStreetMap, quindi non c'è un database da correggere: si
modifica OSM. Con un account OSM si possono aggiungere e modificare i punti
direttamente dall'app, e la modifica finisce su OSM per tutti.

L'app riconosce anche le grafie alternative: una fontana da cui si beve
(`amenity=fountain` + `drinking_water=yes`) compare tra le fontanelle, un blocco
bagni mappato solo come `building=toilets` compare tra i bagni. Modificandoli,
il loro tag originale resta: non li riscriviamo a modo nostro.

Si può modificare solo ciò che su OSM è un singolo punto. I parchi giochi
disegnati come area — la maggioranza — si vedono ma non si toccano da qui: per
quelli serve un editor vero come iD o JOSM.

Un punto picnic aggiunto dall'app è sempre un **tavolo**
(`leisure=picnic_table`), mai un'area: un'area disegnata come singolo punto
sarebbe una mappa peggiore di nessun punto. Le aree picnic già esistenti si
possono modificare e restano aree.

## Note tecniche

Dettagli di architettura, vincoli e trappole note sono in
[CLAUDE.md](./CLAUDE.md).

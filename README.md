# Fontanelle

Mappa delle risorse pubbliche all'aperto, basata su OpenStreetMap: fontanelle,
bagni pubblici, docce, bagni pubblici storici, stazioni di riparazione bici,
punti di ricarica, parchi giochi e aree picnic.

Il nome è storico — è nata per le sole fontanelle, oggi copre l'outdoor in
generale, con un occhio a chi gira con bambini (parchi giochi, aree picnic,
bagni col fasciatoio).

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

> ⚠️ Il deploy va fatto su `fontanelle.pages.dev` e non altrove: il
> `redirect_uri` OAuth di OpenStreetMap è registrato su quel dominio, quindi su
> qualsiasi altro host il login OSM non funziona.

## Contribuire ai dati

I dati vengono da OpenStreetMap, quindi non c'è un database da correggere: si
modifica OSM. Con un account OSM si possono aggiungere e modificare i punti
direttamente dall'app, e la modifica finisce su OSM per tutti.

I parchi giochi e le aree picnic sono in sola lettura nell'app, perché OSM li
cataloga sotto chiavi (`leisure`, `tourism`) che la parte di scrittura non sa
ancora gestire.

## Note tecniche

Dettagli di architettura, vincoli e trappole note sono in
[CLAUDE.md](./CLAUDE.md).

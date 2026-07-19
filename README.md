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

## Sviluppo

```bash
yarn install
yarn start      # dev server su http://localhost:5173
yarn build      # build di produzione in dist/
yarn preview    # serve la build di produzione in locale
```

Serve un token Mapbox in un file `.env` (non versionato):

```
VITE_MAPBOX_TOKEN=pk.xxxxx
```

## Deploy

Cloudflare Pages:

```bash
npx wrangler pages deploy dist --project-name fontanelle
```

Il token Mapbox è anche un secret di Cloudflare Pages (`VITE_MAPBOX_TOKEN`).

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

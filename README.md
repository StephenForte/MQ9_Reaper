# MQ9 Reaper — Target Selection App

Two-tab web app for selecting and reviewing geographic points on a Google Maps satellite view. Full product scope: `target-selection-app-PRD.md`. Agent/contributor contract: `AGENTS.md`.

## Current phase: P5 — Hardening

- §8.3 error paths (address, lat/long, selection gating, targeting, JSON upload, geocode/Maps failures)
- Config MD validation messages with field names; `blockExtraSelections` tunable
- Key-restriction checklist + optional geocode health probe
- Browser smoke checklist (Chrome / Firefox / Safari)
- Invalid Review uploads clear the previous map/list

## Local setup

1. Copy env and add keys:

```bash
cp .env.example .env
```

2. In [Google Cloud Console](https://console.cloud.google.com/), enable:
   - **Maps JavaScript API**
   - **Geocoding API** (address input)

3. Create two keys (recommended):

| Env var | Restrict by | Restrict API to |
|---------|-------------|-----------------|
| `GOOGLE_MAPS_API_KEY` | HTTP referrers — e.g. `http://localhost:3000/*` | Maps JavaScript API |
| `GEOCODING_API_KEY` | IP (or none for local) | Geocoding API |

4. Set both in `.env`, then:

```bash
npm install
npm test
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Without `GEOCODING_API_KEY`, map click and lat/long still work; address geocode returns 503.

### Key-restriction verification

Do this once after creating keys (local and again on Render):

1. **Maps JS key**
   - Application restriction: **HTTP referrers**
   - Local: `http://localhost:3000/*` (and `http://127.0.0.1:3000/*` if you use that host)
   - Render: `https://<your-service>.onrender.com/*`
   - API restriction: **Maps JavaScript API** only
   - Check: open the app — map tiles load; if blank, open the map error overlay / browser console for referrer or API errors

2. **Geocoding key**
   - Application restriction: **None** (local) or **IP addresses** (Render egress) — never HTTP referrers
   - API restriction: **Geocoding API** only
   - Check with the server running:

```bash
npm run health          # keys present?
npm run health:probe    # live geocode smoke (uses one Geocoding request)
```

`health:probe` should report `geocodingProbe.ok: true`. If you see a referrer message, recreate the geocoding key without HTTP referrer restrictions.

### Browser pass (manual)

On desktop Chrome, Firefox, and Safari (latest):

- [ ] Maps loads on Target Selection
- [ ] Bad address → inline “Couldn't find that address”; map does not move
- [ ] Invalid lat/long → inline field error
- [ ] Load targets → select within min–max → Save Targets → Download JSON
- [ ] Review: valid JSON renders; invalid JSON shows error and clears the map/list
- [ ] Maps key missing (temporarily) → blocking error overlay

## Deploy on Render

1. Push this repo to GitHub.
2. Create a **Web Service** (or use Blueprint with `render.yaml`).
3. Set:
   - `GOOGLE_MAPS_API_KEY` — referrer-restrict to your Render domain + Maps JavaScript API
   - `GEOCODING_API_KEY` — Geocoding API only; IP-restrict to Render egress when practical
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — optional until P6 Admin; set now if you want them ready on Render
4. Deploy, then run the key-restriction checks against the live URL (`/api/health?probe=geocode`).

## API

| Route | Purpose |
|-------|---------|
| `GET /api/health` | Liveness + whether Maps/geocoding keys are configured |
| `GET /api/health?probe=geocode` | Same + live geocode smoke (`geocodingProbe`) — not used by Render health checks |
| `GET /api/config` | Public Maps key + defaults (never geocoding key) |
| `GET /api/geocode?q=` | Proxies Google Geocoding → lat/lng + address metadata |
| `GET /api/geocode/reverse?lat=&lng=` | Reverse geocode for region / place default names |

## Project layout

```
server.js              Express: static + health/config/geocode (ESM)
config.js              Loads config/app-config.md
config/app-config.md   Editable defaults (radius, counts, mapType, …)
lib/geocode.js         Geocode proxy helper
public/
  index.html           Two-tab shell + location + candidates + targeting UI
  css/app.css
  js/                  ES modules (app, selection, review, schema, …)
test/                  node:test (dots, geo, selection-logic, schema, review-logic, config, geocode, api)
render.yaml            Render Blueprint
AGENTS.md              Coding / phase standards
```

Tune product knobs in `config/app-config.md`, then restart the server. An in-app Admin editor is planned for phase P6.

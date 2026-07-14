# MQ9 Reaper — Target Selection App

Two-tab web app for selecting and reviewing geographic points on a Google Maps satellite view. Full product scope: `target-selection-app-PRD.md`. Agent/contributor contract: `AGENTS.md`.

## Current phase: P4 — Review tab

- Upload a §4 targets JSON; parse/validate before render
- Re-renders saved center + radius circle and plots N diamond markers
- Click a marker or side-panel row for name / confidence / priority (InfoWindow)
- Invalid uploads keep the last good render and show an inline error

P3 export still produces the file Review consumes.

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

P4 exit check: export JSON from Selection → Review tab → upload → confirm framing + clickable target details.

## Deploy on Render

1. Push this repo to GitHub.
2. Create a **Web Service** (or use Blueprint with `render.yaml`).
3. Set:
   - `GOOGLE_MAPS_API_KEY` — referrer-restrict to your Render domain + Maps JavaScript API
   - `GEOCODING_API_KEY` — Geocoding API only; IP-restrict to Render egress when practical
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — optional until P6 Admin; set now if you want them ready on Render
4. Deploy. P4 exit check: export from Selection, upload in Review, confirm markers + InfoWindows.

## API

| Route | Purpose |
|-------|---------|
| `GET /api/health` | Liveness + whether Maps/geocoding keys are configured |
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
test/                  node:test (dots, geo, selection-logic, schema, review-logic, config)
render.yaml            Render Blueprint
AGENTS.md              Coding / phase standards
```

Tune product knobs in `config/app-config.md`, then restart the server. An in-app Admin editor is planned for phase P6.

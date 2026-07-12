# MQ9 Reaper — Target Selection App

Two-tab web app for selecting and reviewing geographic points on a Google Maps satellite view. See the product PRD for full scope.

## Phase 0 (this commit)

Skeleton & hosting:

- Express web service serving a static frontend
- Two-tab nav: **Target Selection** and **Review**
- Env wiring for `GOOGLE_MAPS_API_KEY` (browser) and `GEOCODING_API_KEY` (server, Phase 1+)
- Satellite map centered on a hardcoded point (`37.7996, -121.7124`)

## Local setup

1. Copy env file and add your Maps JS key:

```bash
cp .env.example .env
```

2. In [Google Cloud Console](https://console.cloud.google.com/), enable **Maps JavaScript API**, create an API key, and restrict it by:
   - **Application**: HTTP referrers — e.g. `http://localhost:3000/*`
   - **API**: Maps JavaScript API only

3. Set `GOOGLE_MAPS_API_KEY` in `.env`.

4. Install and run:

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

`GEOCODING_API_KEY` can stay empty until Phase 1 (address geocode proxy).

## Deploy on Render

1. Push this repo to GitHub.
2. In Render, create a **Web Service** from the repo (or use Blueprint with `render.yaml`).
3. Set environment variables:
   - `GOOGLE_MAPS_API_KEY` — browser Maps JS key, restricted to your Render domain referrer (e.g. `https://your-service.onrender.com/*`) and Maps JavaScript API only
   - `GEOCODING_API_KEY` — optional until Phase 1; Geocoding API only, IP-restricted when used
4. Deploy. Exit check for Phase 0: both tabs load; Target Selection shows a satellite map on the hardcoded center.

## API (Phase 0)

| Route | Purpose |
|-------|---------|
| `GET /api/config` | Returns public Maps key + default config (never geocoding key) |
| `GET /api/geocode` | Stub — returns 501/503 until Phase 1 |

## Project layout

```
server.js          Express: static + /api/config + geocode stub
config.js          Defaults (radius, dotCount, mapType, center)
public/
  index.html       Two-tab shell
  css/app.css
  js/app.js        Tabs + Maps JS bootstrap
render.yaml        Render Blueprint
```

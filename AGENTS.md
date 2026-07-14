# AGENTS.md — MQ9 Reaper

Guidance for humans and coding agents working in this repo. Product scope lives in `target-selection-app-PRD.md`; this file is the day-to-day operating contract.

## Product in one line

Two-tab browser app: **Target Selection** (center → radius → shortlist → annotate → download JSON) and **Review** (upload that JSON → re-render). No accounts, no DB, no server-side target storage in v1.

## Phase discipline

Work one phase at a time. Do not pull later-phase UI into earlier ones.

| Phase | Goal | In scope | Out of scope |
|-------|------|----------|--------------|
| **P0** | Deployable shell | Express static + `/api/config`, two tabs, Maps loads | Location forms, dots, export |
| **P1** | Location + map | Address (proxy), map click, lat/long, radius circle, `fitBounds`, MD config | Dots, selection, export |
| **P2** | Dots + selection | Uniform-disk generation via **Load dots**, toggle select, exact-N gate, confirm when ≥1 selected | Metadata form, JSON export |
| **P3** | Annotate + export | Targeting list, validation, client JSON download (§4 schema) | Review upload |
| **P4** | Review | Upload, schema validate, re-render, info windows | Editing / re-export |
| **P5** | Harden | §8.3 errors, browser pass, key-restriction check | New features |
| **P6** | Admin config | In-app edit of §6 params; gate with `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Broad auth/product admin |

Exit criteria are in the PRD §9. Demo each phase before expanding scope.

## Architecture rules

- **Topology:** Node/Express web service on Render (not a pure static site). Keeps Geocoding off the browser key surface.
- **Secrets:**
  - `GOOGLE_MAPS_API_KEY` — browser Maps JS key; exposed via `/api/config` by design. Restrict by HTTP referrer + Maps JavaScript API only.
  - `GEOCODING_API_KEY` — server only. Never send to the client. Restrict by IP + Geocoding API.
  - Never commit `.env`.
- **Persistence:** Client download/upload of JSON only. Do not add disk/DB storage unless the PRD is updated.
- **Config defaults:** Edit `config/app-config.md` (YAML frontmatter). `config.js` loads it. Keep invariant `minSelections ≤ maxSelections < dotCount`. Admin UI is P6 — do not invent a second config store.
- **Maps:** Default `mapType` is `hybrid`.
- **Recenter:** When `confirmOnRecenter` is true and ≥1 candidate is selected, prompt before center/radius change or Reload targets.
- **Targets (P2/P3):** Operator clicks **Load targets** (no auto-scatter). Use `public/js/dots.js` — uniform disk + `minDotSpacingMeters` rejection (close ok, overlap not). Center/radius change clears candidates until Load again. Selection requires `minSelections`–`maxSelections` (default 1–12).
- **Admin (P6):** Protect with env `ADMIN_USERNAME` / `ADMIN_PASSWORD` only — no OAuth.
## Repo layout

```
server.js                 Express entry: static + API routes (ESM)
config.js                 Loads config/app-config.md → appConfig
config/app-config.md      Human-editable runtime defaults
lib/geocode.js            Geocoding proxy helper (server)
public/
  index.html              Two-tab shell + forms
  css/app.css             App styles
  js/
    app.js                Boot / map lifecycle
    selection.js          Selection-tab center, circle, forms, candidates, export wiring
    selection-logic.js    Pure selection helpers (testable)
    dots.js               Candidate dot generation (uniform disk)
    dot-markers.js        Selected / unselected marker icons
    targeting.js          Targeting-list UI (P3)
    schema.js             §4 JSON build + validate (P3/P4)
    download.js           Client JSON download helper
    confirm.js            Operator confirm dialog
    tabs.js               Tab UI
    geo.js                Bounds + lat/lng helpers
    maps-loader.js        Google Maps script loader
    constants.js          Miles/meters constants
    dom.js                Small DOM helpers
    ui.js                 Field/map error helpers
test/                     node:test coverage (dots, geo, selection-logic, schema, config)
render.yaml               Render Blueprint
target-selection-app-PRD.md
```

Prefer small ES modules under `public/js/` over one growing `app.js`. Keep server routes thin; put Google/HTTP details in `lib/`.

## Coding standards

- **Stack:** Plain HTML/CSS/JS (ES modules) + Express. No React/framework unless explicitly requested.
- **Match existing style:** CSS variables in `:root`, Barlow + IBM Plex Mono, operational dark UI already in the app — extend it; don't redesign.
- **Comments:** Only explain non-obvious PRD/behavior ties (e.g. §5.3 disk sampling). No narrating obvious code.
- **Errors:** Inline field errors for forms; blocking overlay for map-load failures. Prefer clear operator language from PRD §8.3.
- **XSS:** Build error UI with `textContent` / `replaceChildren`, not string `innerHTML` for dynamic text.
- **Validation:** Lat ∈ [−90, 90], lng ∈ [−180, 180]; radius `> 0`. JSON schema build/validate lives in `public/js/schema.js` (P3 export; P4 upload reuses it).
- **Modules:** Package is ESM (`"type": "module"`). Prefer small ES modules under `public/js/` over one growing `app.js`. Keep server routes thin; put Google/HTTP details in `lib/`.
- **No drive-by refactors** outside the active phase. When touching structure for maintainability, keep behavior stable and phase-scoped.
- **Do not** invent auth, analytics, routing tools, or server file libraries.

## API surface (v1)

| Route | Returns |
|-------|---------|
| `GET /api/health` | `{ ok, mapsKeyConfigured, geocodingConfigured }` |
| `GET /api/config` | `{ mapsApiKey, defaults }` — never geocoding key |
| `GET /api/geocode?q=` | `{ lat, lng, formattedAddress, addressComponents, types }` or error JSON |
| `GET /api/geocode/reverse?lat=&lng=` | Reverse geocode payload for region / place names |

## Product decisions in force

1. Render Web Service + geocode proxy (Q1).
2. Client download/upload only (Q2).
3. Selection count: at least `minSelections`, at most `maxSelections` (defaults 1–12). Selecting above max is blocked.
4. Dots may be close but must not overlap; `minDotSpacingMeters` (default 50) via rejection sampling (Q4).
5. Confirm on recenter when ≥1 candidate is selected (`confirmOnRecenter`). Targets load only via **Load targets**.
6. Config via `config/app-config.md` now; Admin in P6 (Q6).
7. `hybrid` default map type (Q7).
8. Review shows metadata on marker click (Q8 — P4).
9. Unseeded RNG; export `seed: null` (Q9).
10. Miles only in v1 (Q10).
11. P6 Admin auth = simple `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars.
12. Default annotation on Save Targets: place/address name when reverse-geocode finds one, else `{Region} Target N`; confidence `1`; priority `medium`.

## Local checklist

```bash
cp .env.example .env   # set both keys
npm install
npm test
npm start              # http://localhost:3000
```

Without `GEOCODING_API_KEY`, map click and lat/long still work; address geocode returns 503.

## When changing behavior

1. Check the PRD acceptance criteria for the active phase.
2. Prefer updating shared helpers (`geo.js`, `config.js`, `lib/geocode.js`) over duplicating math or API calls.
3. Tunable product knobs go in `config/app-config.md`, not hardcoded in UI strings alone.
4. Update README only when setup, API, or phase status changes.
5. Do not invent schema fields outside §4 without an explicit product decision.

# AGENTS.md — MQ9 Reaper

Guidance for humans and coding agents working in this repo. Product scope lives in `target-selection-app-PRD.md`; this file is the day-to-day operating contract.

## Product in one line

Two-tab browser app (plus optional **Admin** when credentials are set): **Target Selection** (center → radius → shortlist → annotate → download JSON and/or save to server disk) and **Review** (upload that JSON or load from server → re-render). No accounts, no DB; optional target-JSON files on the Render persistent disk.

## Phase discipline

Work one phase at a time. Do not pull later-phase UI into earlier ones.

| Phase | Goal | In scope | Out of scope |
|-------|------|----------|--------------|
| **P0** | Deployable shell | Express static + `/api/config`, two tabs, Maps loads | Location forms, dots, export |
| **P1** | Location + map | Address (proxy), map click, lat/long, radius circle, `fitBounds`, MD config | Dots, selection, export |
| **P2** | Dots + selection | Uniform-disk generation via **Load targets**, toggle select, min–max gate, confirm when ≥1 selected | Metadata form, JSON export |
| **P3** | Annotate + export | Targeting list, validation, client JSON download (§4 schema) | Review upload |
| **P4** | Review | Upload, schema validate, re-render, info windows | Editing / re-export |
| **P5** | Harden | §8.3 errors, browser pass, key-restriction check | New features |
| **P6** | Admin config | In-app edit of §6 params; gate with `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Broad auth/product admin |
| **P7** | Persist Admin | Render persistent disk so Admin MD writes survive redeploy | New product features |

Exit criteria are in the PRD §9. Demo each phase before expanding scope. **P0–P7 are complete for v1.**

## Architecture rules

- **Topology:** Node/Express web service on Render (not a pure static site). Keeps Geocoding off the browser key surface.
- **Secrets:**
  - `GOOGLE_MAPS_API_KEY` — browser Maps JS key; exposed via `/api/config` by design. Restrict by HTTP referrer + Maps JavaScript API only.
  - `GEOCODING_API_KEY` — server only. Never send to the client. Restrict by IP + Geocoding API.
  - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — gate Admin tab + `/api/admin/*`. Password must be ≥12 chars. Both required or Admin stays hidden.
  - `ADMIN_SESSION_SECRET` — recommended (≥16 chars); signs Admin session cookies. If omitted, a password-derived key is used with a warning.
  - `CONFIG_PATH` — optional absolute path to the runtime config MD. Render Blueprint sets `/var/data/app-config.md` on the persistent disk.
  - `TARGETS_PATH` — optional absolute directory for saved target JSON. Render Blueprint sets `/var/data/targets`. Locally defaults to `data/targets` (gitignored).
  - Never commit `.env`.
- **Persistence:** Client download/upload of target JSON remains. Operators can also **Save to server** (public `POST /api/targets`) onto the persistent disk; Review can list/load those files. Config defaults: repo `config/app-config.md` is the seed; on Render, Admin writes the persistent-disk copy (`CONFIG_PATH` / `/var/data/app-config.md`). First boot seeds the disk from the repo file if missing. Target files live under `TARGETS_PATH` (or `dirname(CONFIG_PATH)/targets`).
- **Config defaults:** Edit `config/app-config.md` (YAML frontmatter) or use Admin. `config.js` loads/validates/serializes it (`bootstrapAppConfig` / `resolveConfigPath`). Keep invariant `minSelections ≤ maxSelections < dotCount`. Do not invent a second config store.
- **Maps:** Default `mapType` is `hybrid`.
- **Recenter:** When `confirmOnRecenter` is true and ≥1 candidate is selected, prompt before center/radius change or Reload targets.
- **Targets (P2/P3):** Operator clicks **Load targets** (no auto-scatter). Use `public/js/dots.js` — uniform disk + `minDotSpacingMeters` rejection (close ok, overlap not). Center/radius change clears candidates until Load again. Selection requires `minSelections`–`maxSelections` (default 1–12). When `blockExtraSelections` is true (default), selecting above max is blocked; when false, extras are allowed but Save stays gated to the range. New exports require non-empty `title` and `category`; Download JSON and Save to server share the same gate.
- **Admin (P6/P7):** Login form → HttpOnly session cookie (HMAC via `ADMIN_SESSION_SECRET` or password-derived fallback). Password ≥12 chars. Timing-safe credential compare; 5 logins/min/IP. Atomic MD writes. `trust proxy` for Secure cookies on Render. After save, **Apply & reload**. Admin can edit title/category or delete saved target JSON files. No OAuth. Render Blueprint: `plan: starter` + disk at `/var/data`.

## Repo layout

```
server.js                 Express entry: static + API routes (ESM); bootstraps config path
config.js                 Loads/writes/seeds app-config.md → app config (P7 path resolve)
config/app-config.md      Repo seed + local runtime defaults
lib/geocode.js            Geocoding proxy helper (server)
lib/admin-session.js      Admin session cookie sign/verify + auth gates
lib/login-rate-limit.js   In-memory Admin login rate limiter
lib/targets-store.js      Saved target JSON on disk (list/read/write/meta/delete)
data/targets/             Local default target-JSON dir (gitignored)
public/
  index.html              Tab shell + forms (Selection / Review / Admin)
  css/app.css             App styles
  js/
    app.js                Boot / map lifecycle
    app-types.js          Shared AppConfig typedef
    admin.js              Admin tab login + config editor
    selection.js          Selection-tab center, radius, candidates, export
    selection-forms.js    Selection location / radius form wiring
    selection-logic.js    Pure selection helpers (testable)
    reverse-geocode.js    Client reverse-geocode fetch helper
    review.js             Review-tab upload, render, InfoWindows
    review-logic.js       Pure parse + Review display helpers (testable)
    map-radius-overlay.js Shared center pin + radius circle + fitBounds
    dots.js               Candidate dot generation (uniform disk)
    dot-markers.js        Candidate + saved-target marker icons
    targeting.js          Targeting-list UI (P3)
    schema.js             §4 JSON build + validate (P3/P4)
    download.js           Client JSON download helper
    confirm.js            Operator confirm dialog
    tabs.js               Tab UI
    geo.js                Bounds + lat/lng helpers
    maps-loader.js        Google Maps script loader
    constants.js          Miles/meters constants
    dom.js                Small DOM helpers
    ui.js                 Field/map/status helpers
test/                     node:test (…, config-persist, admin, api, …)
render.yaml               Render Blueprint (Starter + persistent disk)
target-selection-app-PRD.md
```

Prefer small ES modules under `public/js/` over one growing `app.js`. Keep server routes thin; put Google/HTTP details in `lib/`.

## Coding standards

- **Stack:** Plain HTML/CSS/JS (ES modules) + Express. No React/framework unless explicitly requested.
- **Match existing style:** CSS variables in `:root`, Barlow + IBM Plex Mono, operational dark UI — extend it; don't invent a second visual language.
- **Comments:** Only explain non-obvious PRD/behavior ties (e.g. §5.3 disk sampling). No narrating obvious code.
- **Errors:** Inline field errors for forms; blocking overlay for map-load failures. Prefer clear operator language from PRD §8.3.
- **XSS:** Build error UI with `textContent` / `replaceChildren`, not string `innerHTML` for dynamic text.
- **Validation:** Lat ∈ [−90, 90], lng ∈ [−180, 180]; radius `> 0`. JSON schema build/validate lives in `public/js/schema.js` (P3 export; P4 upload reuses it). Config validation lives in `config.js` (`toAppConfig` / `mergeAdminConfigPatch`).
- **Modules:** Package is ESM (`"type": "module"`). Prefer small ES modules under `public/js/` over one growing `app.js`. Keep server routes thin; put Google/HTTP details in `lib/`.
- **No drive-by refactors** outside the active phase. When touching structure for maintainability, keep behavior stable and phase-scoped.
- **Do not** invent OAuth, analytics, or routing tools. Target JSON on disk goes through `lib/targets-store.js` only.

## API surface (v1)

| Route | Returns |
|-------|---------|
| `GET /api/health` | `{ ok, mapsKeyConfigured, geocodingConfigured, adminConfigured, configPersistent, targetsPersistent }` (+ optional `geocodingProbe` when `?probe=geocode`) |
| `GET /api/config` | `{ mapsApiKey, adminConfigured, defaults }` — never geocoding key |
| `GET /api/geocode?q=` | `{ lat, lng, formattedAddress, addressComponents, types }` or error JSON |
| `GET /api/geocode/reverse?lat=&lng=` | Reverse geocode payload for region / place names |
| `GET /api/targets` | `{ targets: [{ id, title, category, createdAt, filename, invalid?, error? }] }` (public; corrupt/schema-invalid files are listed with `invalid: true` so Admin can delete them) |
| `GET /api/targets/:id` | Full §4 target JSON (public) |
| `POST /api/targets` | Persist validated target JSON; returns `{ ok, id, title, category, createdAt }` (public) |
| `PATCH /api/targets/:id` | Update `title` / `category` (Admin) |
| `DELETE /api/targets/:id` | Delete one file (Admin) |
| `POST /api/admin/targets/delete` | `{ ids: string[] }` bulk delete (Admin) |
| `POST /api/admin/login` | Session cookie on success (requires `ADMIN_*`) |
| `POST /api/admin/logout` | Clears session cookie |
| `GET /api/admin/session` | `{ adminConfigured, authenticated }` |
| `GET /api/admin/config` | Editable defaults (auth required) |
| `PUT /api/admin/config` | Validate + write MD + update in-memory defaults (auth required); client must Apply & reload |

## Product decisions in force

1. Render Web Service + geocode proxy (Q1).
2. Client download/upload plus optional disk save/load on the Render persistent disk (Q2 amended).
3. Selection count: at least `minSelections`, at most `maxSelections` (defaults 1–12). Selecting above max is blocked when `blockExtraSelections` is true (default).
4. Dots may be close but must not overlap; `minDotSpacingMeters` (default 50) via rejection sampling (Q4).
5. Confirm on recenter when ≥1 candidate is selected (`confirmOnRecenter`). Targets load only via **Load targets**.
6. Config via `config/app-config.md`; Admin in P6 writes the same logical config (Q6).
7. `hybrid` default map type (Q7).
8. Review shows metadata on marker click (Q8 — P4). Invalid Review uploads clear the previous render (P5).
9. Unseeded RNG; export `seed: null` (Q9).
10. Miles only in v1 (Q10).
11. P6 Admin auth = simple `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars.
12. Default annotation on Save Targets: place/address name when reverse-geocode finds one, else `{Region} Target N`; confidence `1`; priority `medium`. Show a non-blocking notice if reverse geocode fails. File-level `title` and `category` are required on new exports.
13. P6 Apply & reload after save; P7 Render persistent disk at `/var/data` with `CONFIG_PATH` / `TARGETS_PATH`, first-boot config seed from repo.

## Local checklist

```bash
cp .env.example .env   # set Maps + geocoding keys; optional ADMIN_* / CONFIG_PATH
npm install
npm test
npm start              # http://localhost:3000
```

Without `GEOCODING_API_KEY`, map click and lat/long still work; address geocode returns 503.
Without both `ADMIN_USERNAME` and `ADMIN_PASSWORD` (12+ chars), the Admin tab stays hidden. Set `ADMIN_SESSION_SECRET` (16+) in production.

## When changing behavior

1. Check the PRD acceptance criteria for the active phase.
2. Prefer updating shared helpers (`geo.js`, `config.js`, `lib/geocode.js`) over duplicating math or API calls.
3. Tunable product knobs go in `config/app-config.md` (or Admin), not hardcoded in UI strings alone.
4. Update README only when setup, API, or phase status changes.
5. Do not invent schema fields outside §4 without an explicit product decision.

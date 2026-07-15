# MQ9 Reaper — Target Selection App

Browser app for selecting and reviewing geographic points on a Google Maps hybrid view. Full product scope: `target-selection-app-PRD.md`. Agent/contributor contract: `AGENTS.md`.

## Current phase: P7 + saved target JSON on disk (v1 complete)

- Render Blueprint uses **Starter** plan + a **1 GB persistent disk** mounted at `/var/data`
- `CONFIG_PATH=/var/data/app-config.md` — Admin config writes survive redeploy
- `TARGETS_PATH=/var/data/targets` — optional Save to server / Review library / Admin manage
- First boot copies repo `config/app-config.md` onto the disk if missing; later Admin edits own that file
- `/api/health` includes `configPersistent` and `targetsPersistent` for deploy smoke checks
- Locally, leave `CONFIG_PATH` / `TARGETS_PATH` unset to use the repo config file and `data/targets/`

Earlier phases (P0–P6) remain in force: Selection + Review + Admin, §8.3 errors, key-restriction checklist.

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

4. Set both in `.env`. Optionally set Admin env vars to enable the Admin tab:

| Env var | Notes |
|---------|-------|
| `ADMIN_USERNAME` | Shared admin username |
| `ADMIN_PASSWORD` | ≥12 characters or Admin stays disabled |
| `ADMIN_SESSION_SECRET` | ≥16 characters recommended; signs session cookies |
| `CONFIG_PATH` | Optional absolute path to runtime config MD (Render sets this via Blueprint) |
| `TARGETS_PATH` | Optional absolute directory for saved target JSON (Render sets `/var/data/targets`) |
| `MCP_API_KEY` | Optional; ≥16 characters enables remote MCP at `/mcp` (Bearer auth) |

Then:

```bash
npm install
npm test
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Without `GEOCODING_API_KEY`, map click and lat/long still work; address geocode returns 503.
Without Admin credentials (or with a password shorter than 12 chars), the Admin tab stays hidden.

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
- [ ] Load targets → select within min–max → Save Targets → set title/category → Download JSON and/or Save to server
- [ ] Review: valid JSON renders (file upload or server library); invalid JSON shows error and clears the map/list
- [ ] Admin (when configured): edit saved file title/category; delete selected files
- [ ] Maps key missing (temporarily) → blocking error overlay
- [ ] With `ADMIN_*` set: Admin tab → login → save config → Apply & reload → Selection reflects new defaults

## Deploy on Render

1. Push this repo to GitHub.
2. Create a **Web Service** from Blueprint (`render.yaml`) — **Starter** plan with disk at `/var/data`.
3. Set:
   - `GOOGLE_MAPS_API_KEY` — referrer-restrict to your Render domain + Maps JavaScript API
   - `GEOCODING_API_KEY` — Geocoding API only; IP-restrict to Render egress when practical
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` (≥12 chars) — required to enable the Admin tab
   - `ADMIN_SESSION_SECRET` (≥16 chars) — recommended; signs Admin session cookies
   - `MCP_API_KEY` (≥16 chars) — optional; enables remote MCP at `/mcp`
   - `CONFIG_PATH` is already set by Blueprint to `/var/data/app-config.md`
4. Deploy, then smoke-check:
   - `/api/health` → `configPersistent: true`
   - `/api/health?probe=geocode` for key checks
5. After Admin save + Apply & reload, redeploy once and confirm defaults still match.

**Note:** Without the persistent disk (or without `CONFIG_PATH` pointing at it), Admin writes land on the ephemeral filesystem and can be lost on redeploy. Blueprint includes the disk by default.

## API

| Route | Purpose |
|-------|---------|
| `GET /api/health` | Liveness + Maps/geocoding/Admin/MCP + `configPersistent` / `targetsPersistent` |
| `GET /api/health?probe=geocode` | Same + live geocode smoke (`geocodingProbe`) — not used by Render health checks |
| `GET /api/config` | Public Maps key + defaults + `adminConfigured` (never geocoding key) |
| `GET /api/geocode?q=` | Proxies Google Geocoding → lat/lng + address metadata |
| `GET /api/geocode/reverse?lat=&lng=` | Reverse geocode for region / place default names |
| `GET /api/targets` | List saved target JSON on disk |
| `GET /api/targets/:id` | Load one §4 target file |
| `POST /api/targets` | Save validated target JSON (appears in Review + Admin) |
| `POST /api/admin/login` | Admin session cookie |
| `POST /api/admin/logout` | Clear Admin session |
| `GET /api/admin/session` | `{ adminConfigured, authenticated }` |
| `GET /api/admin/config` | Current editable defaults (auth) |
| `PUT /api/admin/config` | Validate + write MD (auth); then Apply & reload in the UI |
| `POST/GET/DELETE /mcp` | Remote MCP (Streamable HTTP). Enabled only when `MCP_API_KEY` is set (16+) |

## Remote MCP (ChatGPT / Claude / Cursor)

When `MCP_API_KEY` is set, the same Render service exposes a Streamable HTTP MCP endpoint that reads and creates target JSON on the persistent disk (same store as Review / Admin).

1. Set `MCP_API_KEY` (16+ chars) in `.env` or the Render dashboard.
2. In the host (Claude custom connector, ChatGPT MCP app, Cursor):
   - URL: `https://<your-service>.onrender.com/mcp` (or `http://localhost:3000/mcp` locally)
   - Auth: `Authorization: Bearer <MCP_API_KEY>`
3. Confirm `/api/health` shows `mcpConfigured: true`.

**Tools:** `list_targets`, `get_target`, `create_target`, `summarize_library`  
**Resources:** `targets://library`, `targets://{id}`  
**Prompts:** `inspect_target`, `compare_targets`, `draft_target_package`

`create_target` writes a validated §4 JSON package via `lib/targets-store.js`, so it shows up under Review (server library) and Admin. Delete/rename stay Admin-only. If the key is unset, `/mcp` returns 503.

## Project layout

```
server.js              Express: static + health/config/geocode/admin/mcp (ESM)
config.js              Loads/writes/seeds app-config.md (P7 path resolve)
config/app-config.md   Repo seed + local defaults (radius, counts, mapType, …)
lib/geocode.js         Geocode proxy helper
lib/admin-session.js   Admin session cookie helpers
lib/targets-store.js   Saved target JSON on disk
lib/mcp/               Remote MCP auth + tools/resources/prompts + /mcp mount
public/
  index.html           Selection / Review / Admin UI
  css/app.css
  js/                  ES modules (app, selection, review, admin, schema, …)
test/                  node:test (…, mcp, config-persist, admin, api, …)
render.yaml            Render Blueprint (Starter + disk)
AGENTS.md              Coding / phase standards
```

Tune product knobs in Admin (preferred) or by editing the active config file and restarting.

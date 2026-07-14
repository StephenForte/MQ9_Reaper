# Product Requirements Document — MQ9 Reaper / Map Target Selection (v1)

## Summary

This is a two-tab browser app (plus an optional **Admin** tab when credentials are set) for selecting and reviewing geographic points of interest on a Google Maps **hybrid** view. In **Target Selection**, an operator pins a location (street address, map click, or lat/long), sets a radius (default 3 miles), clicks **Load targets** to scatter `dotCount` candidates (default 25) inside the circle, shortlists between `minSelections` and `maxSelections` (defaults 1–12), annotates them (name, confidence 1–5, priority), and downloads a JSON file. In **Upload to Reaper** (Review), the operator uploads that JSON and the app re-renders the same center, radius, and annotated points as gold diamond markers. v1 uses a thin Express backend to serve the app, proxy geocoding (forward + reverse), and optionally gate Admin config edits; there is no operator accounts system, no database, and no server-side storage of target files.

---

## 1. Overview

### 1.1 What it does
A browser-based tool for placing, annotating, and reviewing a shortlist of points within a defined radius of a chosen location, using Google Maps hybrid imagery. Output is a portable JSON file the operator downloads and can later upload for read-only review.

### 1.2 Who it's for
A single operator working through a location-scoping or site-selection workflow who needs a repeatable way to (a) generate candidate points around an area of interest, (b) whittle them down to a shortlist with metadata, and (c) hand off or revisit that shortlist later as a file. *(Assumption: single-user, single-session workflow — no collaboration, sharing, or multi-user concurrency in v1.)*

### 1.3 What it is not (v1 scope guardrails)
- No operator login for Selection / Upload to Reaper. *(Optional Admin tab uses shared `ADMIN_USERNAME` / `ADMIN_PASSWORD` — not a product accounts system.)*
- No server-side storage or database of saved target files (see §7.4).
- No editing or re-export of a loaded file in Upload to Reaper — read-only display.
- No routing, distance measurement, or analytics beyond what's described here.

---

## 2. Tab Flows (User Stories / Acceptance Criteria)

### 2.1 Tab 1 — Target Selection

**Story:** As an operator, I want to define an area, load candidate points, shortlist within the configured min–max range, annotate them, and save them to a file.

**Acceptance criteria:**

1. **Location input — the tab exposes all three input methods:**
   - **AC-1.1 Address:** Given a user types a street address and submits it, when geocoding succeeds, then the map centers on the returned coordinates and the radius circle is drawn.
   - **AC-1.2 Map click / dropped pin:**
     - **No candidates loaded:** clicking the map sets that point as the center, recenters, and redraws the radius circle.
     - **Candidates loaded:** clicking outside existing dots/targets opens a three-way choice: **Add custom target** (place a selectable candidate at the click), **Recenter** (new center; clears candidates until Load again), or **Keep current** (no change). Clicking an existing candidate toggles selection (AC-5), not this dialog.
   - **AC-1.3 Lat/long:** Given the user enters a valid latitude and longitude, when they submit, then the map centers on that coordinate and the radius circle is drawn.
2. **AC-2 Map render:** When a center is set, the map displays with the configured `mapType` (default **`hybrid`**), zoomed so the full radius circle is visible.
3. **AC-3 Radius:** A radius circle (default 3 miles) is drawn around the center. Changing the radius setting redraws the circle and refits the zoom. Changing center or radius **clears** loaded candidates until the operator clicks **Load targets** again.
4. **AC-4 Dot generation:** Candidates are **not** auto-scattered. When a center and radius are set, the operator clicks **Load targets** (or **Reload targets**). The app then places `dotCount` dots at random positions uniformly within the radius circle (algorithm in §5.3), with `minDotSpacingMeters` rejection sampling.
5. **AC-5 Selection:** The user can click a candidate to select it and click again to deselect. Selected candidates are visually distinct (e.g., color change). A live counter shows `selected / maxSelections`. Custom candidates from AC-1.2 count the same as generated dots.
6. **AC-6 Save Targets gating:** **Save Targets** is enabled when the selected count is in `[minSelections, maxSelections]` (defaults 1–12). When `blockExtraSelections` is true (default), selecting above `maxSelections` is blocked; when false, extras may be selected but Save stays gated to the range.
7. **AC-7 Targeting list:** On **Save Targets**, the selected dots populate a targeting list. Each row shows its lat/long (read-only) and editable fields: **name** (text), **confidence** (1–5), **priority** (low/medium/high/critical). Defaults: place/address name from reverse geocode when available, else `{Region} Target N`; confidence `1`; priority `medium`. A non-blocking notice appears if reverse geocode fails.
8. **AC-8 Validation before export:** The final export is blocked until every row has a non-empty name, a confidence in 1–5, and a priority selected.
9. **AC-9 Export:** On final download, the app writes a JSON file (schema in §4) and triggers a client-side download. Each target includes its lat/long. Export is a browser download, not a server upload (§7.4).

### 2.2 Tab 2 — Upload to Reaper (Review)

**Story:** As an operator, I want to load a saved file and see its annotated points on the same map view.

**UI label:** The tab button reads **Upload to Reaper**. Side-panel copy may still describe the flow as review/re-render.

**Acceptance criteria:**

1. **AC-10 Upload:** The user selects a `.json` file from disk.
2. **AC-11 Parse & validate:** The app validates the file against the schema (§4). On failure it shows a clear error, does not attempt to render, and clears any previous Upload to Reaper map/list (see §8).
3. **AC-12 Render:** On success, the app renders the map centered on the saved center at the saved radius, and plots the saved points as **gold diamond** markers (distinct from Selection candidate circles).
4. **AC-13 Detail on demand:** Clicking a plotted point (or its list row) shows its saved name, confidence, and priority (e.g., in an info window).
5. **AC-14 Read-only:** Upload to Reaper does not modify or re-export the file in v1.

> **Design note — why the file must carry the center and radius:** Tab 2 must render "the same map view." The point cloud alone does not define framing. The saved file stores the original `center` and `radiusMiles` so Upload to Reaper can reproduce exact framing.

### 2.3 Tab 3 — Admin (optional, P6)

**Story:** As an operator with Admin credentials, I want to tune §6 defaults in-app without editing files or redeploying code.

**Acceptance criteria (when `ADMIN_USERNAME` and `ADMIN_PASSWORD` ≥12 chars are set):**

1. Admin tab is visible; otherwise it stays hidden.
2. Login form → signed HttpOnly session cookie (`ADMIN_SESSION_SECRET` recommended ≥16; password-derived fallback with warning if omitted).
3. Authenticated operator can view/edit editable §6 parameters and save; server validates and writes the active config MD atomically (repo file locally; persistent disk on Render — P7).
4. After save, operator must click **Apply & reload** for the open browser to pick up new defaults.
5. Timing-safe credential compare; login rate limit 5/min/IP; `trust proxy` for Secure cookies on Render.

---

## 3. Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Accept a location via **street address**, geocode it to lat/long (server proxy), and center the map. |
| FR-2 | Accept a location via **map click**; with no candidates, use the click as center. With candidates loaded, offer add-custom / recenter / keep (§2.1 AC-1.2). |
| FR-3 | Accept a location via **manual lat/long entry**; validate ranges (lat −90..90, lng −180..180). |
| FR-4 | Render a **Google Maps** view (`hybrid` default; `satellite` configurable) centered on the resolved location. |
| FR-5 | Draw a **radius circle** (default 3 mi) and auto-fit zoom so it is fully visible. |
| FR-6 | On **Load targets**, generate **`dotCount` dots** uniformly within the radius (§5.3); clear candidates on center/radius change until Load again. |
| FR-7 | Support **click-to-toggle selection** with a distinct selected state and a live `selected / maxSelections` counter. |
| FR-8 | Enforce selection count in **`[minSelections, maxSelections]`** before Save Targets; honor `blockExtraSelections`. |
| FR-8b | Allow **custom candidates** from blank-map clicks while targets are loaded (same selection rules as generated dots). |
| FR-9 | Present a **targeting list** of selected points with read-only lat/long and editable name, confidence (1–5), priority (enum); seed defaults via reverse geocode when possible. |
| FR-10 | Validate all rows are complete before export. |
| FR-11 | **Export** the annotated targets (with center + radius + generation metadata) to a JSON file via client download. |
| FR-12 | **Upload** a JSON file in Upload to Reaper, validate against the schema, and surface parse/validation errors. |
| FR-13 | **Re-render** the saved center/radius and **plot N gold diamond markers**; show metadata on point click. |
| FR-14 | Expose **radius**, **dot count**, **min/max selections**, and related knobs as configurable parameters (§6). |
| FR-15 | Keep the geocoding path off the client key surface (§7.3); expose reverse geocode for region/place naming. |
| FR-16 | Optional **Admin** tab for in-app §6 edits gated by env credentials (P6). |

---

## 4. Data Model

### 4.1 Saved target file — schema

```jsonc
{
  "version": "1.0",                 // string — schema version, for forward compat
  "createdAt": "ISO-8601 string",   // string — UTC timestamp of export
  "center": {
    "lat": "number",               // −90..90
    "lng": "number",               // −180..180
    "source": "string"             // enum: "address" | "click" | "latlng"
  },
  "radiusMiles": "number",          // > 0
  "generation": {
    "dotCount": "number",          // integer, candidates generated at Load (default 25)
    "requiredSelections": "number",// integer ≥ 1 — actual exported target count (length of targets[])
    "seed": "number | null"        // optional RNG seed; null when unseeded (v1 default)
  },
  "targets": [                       // array, length == generation.requiredSelections
    {
      "id": "string",              // stable id, e.g. "t-01"
      "name": "string",            // non-empty
      "lat": "number",             // −90..90
      "lng": "number",             // −180..180
      "confidence": "number",      // integer 1..5
      "priority": "string"         // enum: "low" | "medium" | "high" | "critical"
    }
  ]
}
```

### 4.2 Filled-in example

```json
{
  "version": "1.0",
  "createdAt": "2026-07-11T18:42:05Z",
  "center": {
    "lat": 37.7996,
    "lng": -121.7124,
    "source": "address"
  },
  "radiusMiles": 3,
  "generation": {
    "dotCount": 25,
    "requiredSelections": 12,
    "seed": null
  },
  "targets": [
    { "id": "t-01", "name": "North ridge marker", "lat": 37.8241, "lng": -121.7050, "confidence": 4, "priority": "high" },
    { "id": "t-02", "name": "Reservoir edge",     "lat": 37.8102, "lng": -121.7291, "confidence": 3, "priority": "medium" },
    { "id": "t-03", "name": "Access road bend",   "lat": 37.7955, "lng": -121.6889, "confidence": 5, "priority": "critical" },
    { "id": "t-04", "name": "South clearing",     "lat": 37.7788, "lng": -121.7201, "confidence": 2, "priority": "low" },
    { "id": "t-05", "name": "Substation",         "lat": 37.8019, "lng": -121.7402, "confidence": 4, "priority": "high" },
    { "id": "t-06", "name": "Trailhead",          "lat": 37.7869, "lng": -121.7011, "confidence": 3, "priority": "medium" },
    { "id": "t-07", "name": "Water tower",        "lat": 37.8155, "lng": -121.7188, "confidence": 5, "priority": "critical" },
    { "id": "t-08", "name": "East gate",          "lat": 37.8003, "lng": -121.6822, "confidence": 3, "priority": "medium" },
    { "id": "t-09", "name": "Culvert",            "lat": 37.7912, "lng": -121.7355, "confidence": 2, "priority": "low" },
    { "id": "t-10", "name": "Rooftop A",          "lat": 37.8078, "lng": -121.7096, "confidence": 4, "priority": "high" },
    { "id": "t-11", "name": "Parking lot NW",     "lat": 37.8199, "lng": -121.7267, "confidence": 3, "priority": "medium" },
    { "id": "t-12", "name": "Fence corner",       "lat": 37.7831, "lng": -121.6944, "confidence": 5, "priority": "critical" }
  ]
}
```

**Notes**
- `generation.requiredSelections` is the **count of targets in this file** (must equal `targets.length`). It is not a live App Config knob; runtime gating uses `minSelections` / `maxSelections` from §6.
- `seed` is included for forward compatibility. v1 is unseeded and writes `null` (`seededRng: false`).
- `id` uniqueness is only required within a single file. Custom Selection candidates use ids like `custom-1` in-session; export still assigns `t-NN` ids.
- Upload to Reaper treats unknown keys as ignorable but hard-fails on missing/invalid required fields.

---

## 5. Behavioral Specifications

### 5.1 Location resolution and Load targets
The three input methods are mutually exclusive per action; the **most recent** successful center input wins. Changing the center or radius **clears** candidate markers (until **Load targets** again). When `confirmOnRecenter` is true and ≥1 candidate is **selected**, prompt before center/radius change or Reload targets.

While candidates are loaded, a blank map click does **not** immediately recenter — it offers Add custom target / Recenter / Keep current (§2.1 AC-1.2).

### 5.2 Radius circle and zoom
- Compute the radius in meters: `radiusMeters = radiusMiles * 1609.344`.
- Draw a `google.maps.Circle` centered on the resolved point with that radius.
- Fit zoom via `map.fitBounds()` using a bounds box derived from the center offset by ±`radiusMeters` (see §5.3 for the meters→degrees conversion).

### 5.3 Random dot generation (uniform over a disk)
Naive uniform sampling of lat/long inside the bounding box, or uniform `(radius, angle)`, both cluster points toward the center. Use area-uniform sampling:

For each of `dotCount` dots:
```
u = random()               // [0,1)
v = random()               // [0,1)
r = radiusMeters * sqrt(u) // sqrt corrects for disk area
theta = 2 * PI * v
dxMeters = r * cos(theta)
dyMeters = r * sin(theta)

dLat = dyMeters / 111320
dLng = dxMeters / (111320 * cos(centerLat_in_radians))

dotLat = centerLat + dLat
dotLng = centerLng + dLng
```
- `111320` = approximate meters per degree of latitude. The `cos(lat)` term corrects longitude spacing. Accurate enough for a few-mile radius; distortion is negligible below ~10 mi outside polar latitudes.
- **Minimum spacing:** dots may be close, but must not overlap. Reject a candidate if it is within `minDotSpacingMeters` (config, default 50) of an already-placed dot; retry up to a bounded attempt count. If packing still fails (tiny radius / large spacing), the last candidate is kept so `dotCount` stays exact — prefer lowering spacing or radius over under-generating.
- Custom map-click candidates are **not** subject to spacing rejection (operator intent).

### 5.4 Selection state
- Each candidate holds `{ id, lat, lng, selected: bool }`.
- Selected candidates render in a distinct style. Save Targets enables when `minSelections ≤ selectedCount ≤ maxSelections`.
- Deselecting after Save Targets has populated the list, and re-saving, replaces the list (rebuild; no merge of partial edits).

### 5.5 Annotation defaults
On Save Targets, reverse-geocode each selected point (and the center for a region label when needed). Prefer a specific place/address name when found; otherwise `{Region} Target N`. Confidence defaults to `1`; priority to `medium`. Failures are non-blocking with an inline notice.

---

## 6. Configurable Parameters

| Parameter | Default | Type / Range | Where it's used |
|-----------|---------|--------------|-----------------|
| `radiusMiles` | **3** | number > 0 | Radius circle, zoom fit, dot generation bounds. |
| `dotCount` | **25** | integer > `maxSelections` | Candidates generated on **Load targets**. |
| `minSelections` | **1** | integer ≥ 1, ≤ `maxSelections` | Minimum selected count before Save Targets. |
| `maxSelections` | **12** | integer ≥ `minSelections`, < `dotCount` | Maximum valid shortlist size; counter denominator. |
| `blockExtraSelections` | **true** | boolean | If true, block selecting above `maxSelections`. If false, allow extras but keep Save gated to the min–max range. |
| `minDotSpacingMeters` | **50** | number ≥ 0 | Min distance between generated candidates; close allowed, overlap not. |
| `mapType` | **`hybrid`** | `satellite` \| `hybrid` | Base map imagery (`hybrid` = imagery + labels). |
| `radiusUnit` | **`miles`** | `miles` (v1) | Display / input unit. km out of scope for v1. |
| `confirmOnRecenter` | **true** | boolean | Prompt before center/radius change or Reload when ≥1 candidate is selected. |
| `seededRng` | **false** | boolean | If false, export writes `seed: null`. |
| `defaultCenterLat` / `defaultCenterLng` | **37.7996 / -121.7124** | valid lat/lng | Startup Selection center before operator sets one. |

**Config delivery:**

1. **File:** edit `config/app-config.md` (YAML frontmatter). Server loads it via `config.js`. Restart after manual edits. Guard invariant `minSelections ≤ maxSelections < dotCount`.
2. **P6 Admin:** in-app Admin tab writes the same parameters to the active config MD (no separate product settings model). After save, **Apply & reload**. Credentials: `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
3. **P7:** Render persistent disk at `/var/data` with `CONFIG_PATH=/var/data/app-config.md`. First boot seeds from the repo file if missing; Admin edits survive redeploy.

Legacy config key `requiredSelections` (if present alone) maps to `maxSelections` with `minSelections` defaulting to 1.

---

## 7. Architecture & Tech Notes

### 7.1 Topology
- **Single Render Web Service** (Node.js + Express, ESM) that:
  1. Serves the static frontend under `public/` (plain HTML/CSS/JS modules — no SPA framework).
  2. Exposes config, health, geocode (forward + reverse), and optional Admin APIs (§7.5 / `AGENTS.md`).

### 7.2 Google Maps APIs required
| API | Purpose | Needed for |
|-----|---------|-----------|
| **Maps JavaScript API** | Render the map, hybrid/satellite tiles, markers, circle, click handling, `fitBounds`. | Selection + Upload to Reaper. |
| **Geocoding API** | Forward geocode (address → lat/long) and reverse geocode (coords → place/region names). | Selection address input + annotation defaults. |

- Places, Directions, etc. are **not** required for this scope.
- Geocoding runs **server-side** via `/api/geocode` and `/api/geocode/reverse` so the geocoding key never reaches the browser.

### 7.3 API key handling
1. **Maps JavaScript API key (browser).** Exposed via `/api/config` by design. Restrict by **HTTP referrer** to the app domain(s) and by **API** to Maps JavaScript API only.
2. **Geocoding key (server).** `GEOCODING_API_KEY` env only. Restrict by **IP** (Render egress) and **API** (Geocoding only). Never send to the client.
3. **Admin credentials (optional).** `ADMIN_USERNAME` / `ADMIN_PASSWORD` (≥12) gate the Admin tab and `/api/admin/*`. Prefer `ADMIN_SESSION_SECRET` (≥16) for cookie HMAC.

### 7.4 Where the JSON lives — client download vs. server storage
| Option | Pros | Cons |
|--------|------|------|
| **Client download / upload (v1)** | No persistence layer, no DB, no operator auth; user owns the file. | User manages files manually; no in-app history. |
| **Server-side storage** | Central file list / sharing later. | Needs storage + likely auth; Render disk is ephemeral without a persistent disk add-on. |

**v1:** client download + upload only.

### 7.5 Component sketch
```
[ Browser ]
  ├─ Target Selection: center/radius forms, Maps JS (hybrid + circle + candidates),
  │         selection, custom map-click targets, targeting list, JSON download
  ├─ Upload to Reaper: file input, JSON validate, Maps JS + gold diamonds + info windows
  ├─ Admin (optional): login + §6 editor → Apply & reload
  └─ calls ──► /api/config, /api/geocode, /api/geocode/reverse, /api/admin/*

[ Render Web Service (Node/Express) ]
  ├─ serves public/
  ├─ config.js ←→ CONFIG_PATH or repo config/app-config.md (P7 disk at /var/data)
  ├─ /api/geocode* ──► Google Geocoding API
  └─ /api/admin/* (when ADMIN_* configured)
```

---

## 8. Non-Functional Requirements

### 8.1 Browser support
Evergreen desktop browsers, latest two versions: Chrome, Edge, Firefox, Safari. *(Desktop-first; mobile layout is best-effort in v1.)*

### 8.2 Performance expectations
- ~25 markers + 1 circle is trivial for Maps JS; interactions should feel instant.
- Dominant latency is (a) initial Maps JS + tile load and (b) geocoding round-trips. Target: map interactive within ~2–3s on a normal connection; geocode within ~1s. *(Not hard SLAs.)*
- Dot generation is O(dotCount × spacing retries).

### 8.3 Error & edge-case handling
| Case | Expected behavior |
|------|-------------------|
| **Bad / unresolvable address** | Geocoding returns zero results or an error → show inline message ("Couldn't find that address"); do not move the map. |
| **Missing / invalid lat/long** | Validate ranges before use; empty or out-of-range → inline field error; don't recenter. |
| **Fewer than `minSelections` selected** | Save Targets stays disabled; counter shows `n / maxSelections`. No silent proceed. |
| **More than `maxSelections` selected** | If `blockExtraSelections` is true (default), block the next click. If false, allow extras but keep Save gated to the min–max range. |
| **Incomplete targeting rows** | Export blocked; highlight the offending rows/fields. |
| **Malformed JSON on upload** | Catch parse error → "This file isn't valid JSON." Don't attempt render; clear any previous Upload to Reaper map/list. |
| **Schema-invalid JSON** (valid JSON, wrong shape / missing fields / wrong `targets` length) | Show which check failed (e.g., "expected 12 targets, found 9"); don't render; clear previous Upload to Reaper map/list. |
| **Geocode backend/network failure** | Surface a retry-able error; app remains usable via click / lat-long input. Reverse-geocode failure for names is non-blocking with a notice. |
| **Google Maps fails to load** (key/quota/network) | Show a blocking but clear error state rather than a blank tab. |

### 8.4 Security / privacy notes
- No PII collected beyond what the operator types into target names; target files stay on the user's machine in v1.
- Keys handled per §7.3. No secrets in the client bundle beyond the referrer-restricted Maps JS key.
- Admin session cookies are HttpOnly; credentials compared timing-safely; login rate-limited.

---

## 9. Phased Implementation Plan

| Phase | Goal | Includes | Exit criteria | Status |
|-------|------|----------|---------------|--------|
| **P0 — Skeleton & hosting** | App deploys and serves. | Render Web Service, static frontend shell, two-tab nav, env var wiring, Maps JS loads with a restricted key. | Blank two-tab app renders a map on Render. | Done |
| **P1 — Location input + map** | All three center-setting methods work. | Address (via `/api/geocode`), map-click, lat/long; radius circle; `fitBounds`; `config/app-config.md` (`hybrid`, miles). | Any of the three inputs centers the map and draws the default radius. | Done |
| **P2 — Dot generation + selection** | Candidate dots and shortlist mechanics. | **Load targets**, uniform-disk generation (§5.3) + spacing, click-to-toggle, `selected / maxSelections`, min–max gating + `blockExtraSelections`, clear on center/radius change, confirm-on-recenter when selection would be lost. | Operator can load `dotCount` dots and select within min–max; Save enables only in range; dots do not overlap. | Done |
| **P3 — Metadata + export** | Annotate and save. | Targeting list, reverse-geocode name defaults, per-row validation, JSON export matching §4 (`seed: null`). | Schema-valid JSON downloads with N annotated targets + center/radius/generation metadata. | Done |
| **P4 — Upload to Reaper** | Load and display. | File upload, schema validation, re-render center/radius, gold diamond markers, metadata info windows. | A P3 export loads and renders with clickable point details. | Done |
| **P5 — Hardening** | Edge cases + polish. | §8.3 errors, browser pass, key-restriction verification, config MD validation messages; invalid upload clears prior render. | Every §8.3 row behaves as specified. | Done |
| **P6 — Admin config** | In-app config editing. | Admin tab + session auth + atomic MD writes + Apply & reload (see §2.3). | Operator can change §6 parameters without editing files (disk ephemeral until P7). | Done |
| **P7 — Persistent Admin config** | Survive redeploys. | Render Starter + disk at `/var/data`; `CONFIG_PATH`; first-boot seed from repo `config/app-config.md`; document Blueprint. | Admin edits remain after redeploy; `/api/health.configPersistent` true on Render. | Done |

---

## 10. Open Questions

### Decided

1. **Q1 — Backend or static?** → Render Web Service + geocode proxy.
2. **Q2 — Storage in v1?** → Client download/upload only.
3. **Q3 — Selection count semantics.** → Range: at least `minSelections`, at most `maxSelections` (defaults 1–12). Save enables when count is in range. `blockExtraSelections` (default `true`) blocks selecting above max; when `false`, extras are allowed but Save stays gated. Configurable in `config/app-config.md`; Admin UI in P6.
4. **Q5 — Losing work on recenter.** → Yes, confirm when change would clear selection / regenerate via Reload (`confirmOnRecenter`). Targets load only via **Load targets** (no auto-scatter).
5. **Q6 / config delivery.** → MD file (`config/app-config.md`); Admin in **P6**.
6. **Q7 — Map type default.** → `hybrid`.
7. **Q8 — Review metadata display.** → Yes, show name/confidence/priority on point click (P4). Tab UI label: **Upload to Reaper**. Markers: gold diamonds.
8. **Q9 — Seeded RNG.** → Unseeded; export `seed: null` (`seededRng: false`).
9. **Q10 — Units.** → Miles only in v1 (`radiusUnit: miles`).
10. **Q4 — Dot overlap.** → Close allowed; overlap not. Rejection sampling with `minDotSpacingMeters` (default 50).
11. **P6 Admin auth.** → `ADMIN_USERNAME` / `ADMIN_PASSWORD` (password ≥12 or Admin disabled). Prefer `ADMIN_SESSION_SECRET` (≥16). Timing-safe compare; 5 logins/min/IP; atomic MD writes; `trust proxy`. No OAuth/SSO in v1.
12. **P6 Admin UX.** → Third **Admin** tab (hidden when credentials unset/invalid). Editable: radius, counts, block extras, spacing, map type, confirm-on-recenter, default center. Read-only in UI: `radiusUnit`, `seededRng`. Save writes MD; **Apply & reload** required. Disk persist deferred to **P7**.
13. **P7.** → Render Starter + persistent disk at `/var/data`; `CONFIG_PATH=/var/data/app-config.md`; first boot seeds from repo if missing; Admin edits survive redeploy.
14. **Annotation defaults.** → Place/address name from reverse geocode when found, else `{Region} Target N`; confidence `1`; priority `medium`; non-blocking notice on reverse-geocode failure.
15. **Blank map click with candidates loaded.** → Three-way dialog: Add custom target, Recenter, or Keep current.

---

### Requirements checklist (self-audit)
- [x] One-paragraph summary before detailed sections
- [x] Overview: what it does + who it's for + scope guardrails (incl. optional Admin)
- [x] Selection + Upload to Reaper (+ Admin) flows as acceptance criteria
- [x] Functional requirements aligned to shipped behavior (Load targets, min–max, custom clicks, gold diamonds)
- [x] Concrete data model: JSON schema with field names, types, and a filled-in example (`seed: null`)
- [x] Configurable parameters with defaults (`minSelections` / `maxSelections`, not legacy exact-N alone)
- [x] Architecture: Express on Render, Maps JS + Geocoding (forward/reverse), key handling, Admin APIs
- [x] Non-functional: browser support, performance, §8.3 errors
- [x] Open-questions / decided product decisions
- [x] Phased plan with status (P0–P7 done)

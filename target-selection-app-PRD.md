# Product Requirements Document — Map Target Selection App (v1)

## Summary

This is a two-tab web app for selecting and reviewing geographic points of interest on a satellite map. In the **Target Selection** tab, a user pins a location (by street address, map click, or lat/long), and the app renders a Google Maps satellite view centered there with a configurable radius (default 3 miles). The app scatters 25 randomly-positioned dots inside that radius; the user selects exactly 12, annotates each with a name, a 1–5 confidence rating, and a priority (low/medium/high/critical), and saves the set to a JSON file. In the **Review** tab, the user uploads a previously saved JSON file and the app re-renders the same map view with the 12 saved points plotted. v1 is a thin frontend plus a minimal backend used only to proxy geocoding and serve the app; there is no user accounts system, no database, and no server-side persistence of target files.

---

## 1. Overview

### 1.1 What it does
A browser-based tool for placing, annotating, and reviewing 12 selected points within a defined radius of a chosen location, using Google Maps satellite imagery. Output is a portable JSON file.

### 1.2 Who it's for
A single operator working through a location-scoping or site-selection workflow who needs a repeatable way to (a) generate candidate points around an area of interest, (b) whittle them down to a fixed shortlist with metadata, and (c) hand off or revisit that shortlist later as a file. *(Assumption: single-user, single-session workflow — no collaboration, sharing, or multi-user concurrency in v1.)*

### 1.3 What it is not (v1 scope guardrails)
- No login, accounts, or authorization.
- No server-side storage or database of saved files (see §7.4 for the tradeoff).
- No editing of a loaded file in the Review tab — it is read-only display.
- No routing, distance measurement, or analytics beyond what's described here.

---

## 2. Tab Flows (User Stories / Acceptance Criteria)

### 2.1 Tab 1 — Target Selection

**Story:** As an operator, I want to define an area, generate candidate points, shortlist 12, annotate them, and save them to a file.

**Acceptance criteria:**

1. **Location input — the tab exposes all three input methods:**
   - **AC-1.1 Address:** Given a user types a street address and submits it, when geocoding succeeds, then the map centers on the returned coordinates and the radius circle is drawn.
   - **AC-1.2 Map click / dropped pin:** Given the user clicks a point on the map, then that point becomes the center, the map recenters, and the radius circle is redrawn around it.
   - **AC-1.3 Lat/long:** Given the user enters a valid latitude and longitude, when they submit, then the map centers on that coordinate and the radius circle is drawn.
2. **AC-2 Satellite render:** When a center is set, the map displays in satellite view centered on that point, zoomed so the full radius circle is visible. *(Assumption: default map type is `satellite`; `hybrid` — satellite plus labels — is a configurable alternative. See §6.)*
3. **AC-3 Radius:** A radius circle (default 3 miles) is drawn around the center. Changing the radius setting redraws the circle and refits the zoom.
4. **AC-4 Dot generation:** When a center and radius are set, the app places 25 dots at random positions uniformly distributed within the radius circle (algorithm in §5.3). Changing the center or radius regenerates the dots.
5. **AC-5 Selection:** The user can click a dot to select it and click again to deselect. Selected dots are visually distinct (e.g., color change). A live counter shows `selected / 12`.
6. **AC-6 Save Targets gating:** The **Save Targets** button is disabled until *exactly* 12 dots are selected. *(Assumption: exactly 12 required, not "at least 12." Selecting a 13th is prevented, or the button stays disabled above 12 — see Open Questions Q3.)*
7. **AC-7 Targeting list:** On **Save Targets**, the 12 selected dots populate a targeting list. Each row shows its lat/long (read-only) and editable fields: **name** (text), **confidence** (1–5), **priority** (low/medium/high/critical).
8. **AC-8 Validation before export:** The final **Save** (export) is blocked until every row has a non-empty name, a confidence in 1–5, and a priority selected. *(Assumption: all three fields required per row.)*
9. **AC-9 Export:** On final **Save**, the app writes a JSON file (schema in §4) and triggers a client-side download. Each target includes its lat/long. *(Assumption: export is a browser download, not a server upload — see §7.4.)*

### 2.2 Tab 2 — Review

**Story:** As an operator, I want to load a saved file and see its 12 points on the same map view.

**Acceptance criteria:**

1. **AC-10 Upload:** The user selects a `.json` file from disk.
2. **AC-11 Parse & validate:** The app validates the file against the schema (§4). On failure it shows a clear error and does not attempt to render (see §8).
3. **AC-12 Render:** On success, the app renders the satellite map centered on the saved center at the saved radius, and plots the 12 saved points as markers.
4. **AC-13 Detail on demand:** Clicking a plotted point shows its saved name, confidence, and priority (e.g., in an info window). *(Assumption: added because plotting points without their metadata makes "review" close to useless; flag if out of scope.)*
5. **AC-14 Read-only:** The Review tab does not modify or re-export the file in v1.

> **Design note — why the file must carry the center and radius:** the requirement says Tab 2 renders "the same map view." Twelve points alone don't define a view (zoom/center are ambiguous). The saved file therefore stores the original `center` and `radiusMiles` so the Review tab can reproduce the exact framing rather than guessing from the point cloud.

---

## 3. Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Accept a location via **street address**, geocode it to lat/long, and center the map. |
| FR-2 | Accept a location via **map click**; use the clicked lat/long as center. |
| FR-3 | Accept a location via **manual lat/long entry**; validate ranges (lat −90..90, lng −180..180). |
| FR-4 | Render a **Google Maps satellite** view centered on the resolved location. |
| FR-5 | Draw a **radius circle** (default 3 mi) and auto-fit zoom so it is fully visible. |
| FR-6 | Generate **25 dots** at random positions uniformly within the radius (§5.3); regenerate on center/radius change. |
| FR-7 | Support **click-to-toggle selection** of dots with a distinct selected state and a live `selected/12` counter. |
| FR-8 | Enforce **exactly 12** selections before allowing Save Targets. |
| FR-9 | Present a **targeting list** of the 12 selected points with read-only lat/long and editable name, confidence (1–5), priority (enum). |
| FR-10 | Validate all rows are complete before export. |
| FR-11 | **Export** the 12 annotated targets (with center + radius + generation metadata) to a JSON file via client download. |
| FR-12 | **Upload** a JSON file, validate it against the schema, and surface parse/validation errors. |
| FR-13 | **Re-render** the saved center/radius and **plot the 12 points**; show metadata on point click. |
| FR-14 | Expose **radius**, **dot count**, and **required-selection count** as configurable parameters (§6). |
| FR-15 | Keep the geocoding path off the client key surface where feasible (§7.3). |

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
    "dotCount": "number",          // integer, total dots generated (default 25)
    "requiredSelections": "number",// integer, targets required (default 12)
    "seed": "number | null"        // optional RNG seed for reproducibility; null if unseeded
  },
  "targets": [                       // array, length == requiredSelections
    {
      "id": "string",              // stable id, e.g. "t-01" or a UUID
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
    "seed": 84213
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
- `seed` is included so a generation run can be reproduced or audited. If the build doesn't implement seeded RNG in v1, write `null`. *(Assumption.)*
- `id` uniqueness is only required within a single file.
- The Review tab should treat any field beyond this schema as ignorable (don't hard-fail on unknown keys) but must hard-fail on missing/invalid required fields.

---

## 5. Behavioral Specifications

### 5.1 Location resolution precedence
The three input methods are mutually exclusive per action; the **most recent** input wins and resets the center. Changing the center clears the current selection and regenerates dots. *(Assumption: an explicit "you'll lose your current selection" confirm is **not** required in v1 — flag if desired.)*

### 5.2 Radius circle and zoom
- Compute the radius in meters: `radiusMeters = radiusMiles * 1609.344`.
- Draw a `google.maps.Circle` centered on the resolved point with that radius.
- Fit zoom via `map.fitBounds()` using a bounds box derived from the center offset by ±`radiusMeters` (see §5.3 for the meters→degrees conversion). This makes zoom track the radius automatically rather than hardcoding a level.

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
- `111320` = approximate meters per degree of latitude. The `cos(lat)` term corrects longitude spacing. This is accurate enough for a few-mile radius; distortion is negligible below ~10 mi outside polar latitudes. *(Assumption: this approximation is acceptable for v1; a geodesic library is not required.)*
- **Minimum spacing:** dots may be close, but must not overlap. Reject a candidate if it is within `minDotSpacingMeters` (config, default 50) of an already-placed dot; retry up to a bounded attempt count. If packing still fails (tiny radius / large spacing), the last candidate is kept so `dotCount` stays exact — prefer lowering spacing or radius over under-generating.

### 5.4 Selection state
- Each dot holds `{ id, lat, lng, selected: bool }`.
- Selected dots render in a distinct style. The Save Targets button is enabled only when `selectedCount === requiredSelections`.
- Deselecting a dot after Save Targets has populated the list, and re-saving, replaces the list. *(Assumption: re-running Save Targets rebuilds the list; partial edits aren't merged.)*

---

## 6. Configurable Parameters

| Parameter | Default | Type / Range | Where it's used |
|-----------|---------|--------------|-----------------|
| `radiusMiles` | **3** | number > 0 | Radius circle, zoom fit, dot generation bounds. |
| `dotCount` | **25** | integer > `requiredSelections` | Number of candidate dots generated. |
| `requiredSelections` | **12** | integer ≥ 1, < `dotCount` | Number of dots that must be selected before export. |
| `blockExtraSelections` | **true** | boolean | If true, block selecting above `requiredSelections` (exact-N). If false, allow extras but keep Save gated to exact N. |
| `minDotSpacingMeters` | **50** | number ≥ 0 | Min distance between candidate dots; close allowed, overlap not. |
| `mapType` | **`hybrid`** | `satellite` \| `hybrid` | Base map imagery (`hybrid` = imagery + labels). |
| `radiusUnit` | **`miles`** | `miles` (v1) | Display / input unit. km out of scope for v1. |
| `confirmOnRecenter` | **true** | boolean | Prompt before center/radius change when it would clear selection / regenerate dots. |
| `seededRng` | **false** | boolean | If false, export writes `seed: null`. |

**Config delivery:**

1. **File:** edit `config/app-config.md` (YAML frontmatter). Server loads it via `config.js`. Restart after manual edits. Guard invariant `minSelections ≤ maxSelections < dotCount`.
2. **P6 Admin:** in-app Admin tab writes the same parameters to the same MD file (no separate product settings model). After save, **Apply & reload**. Credentials: `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
3. **P7:** Render persistent disk so Admin writes survive redeploy.

---

## 7. Architecture & Tech Notes

### 7.1 Topology
- **Single Render Web Service** (Node.js + Express, or equivalent) that:
  1. Serves the static frontend (HTML/CSS/JS; framework choice open — plain JS or a lightweight SPA both fine for this scope).
  2. Exposes one thin backend route, `GET /api/geocode?q=...`, that proxies Google Geocoding (§7.3).
- *(Assumption: chosen over a Render **Static Site** so geocoding can be proxied server-side and the geocoding key kept off the client. If you'd rather ship a pure static site, geocoding must run client-side via the Maps JS SDK and share the browser key — simpler, less key isolation. See §7.3.)*

### 7.2 Google Maps APIs required
| API | Purpose | Needed for |
|-----|---------|-----------|
| **Maps JavaScript API** | Render the map, satellite/hybrid tiles, markers, circle, click handling, `fitBounds`. | Both tabs. |
| **Geocoding API** | Convert a typed street address → lat/long. | Tab 1, address input only. |

- Reverse geocoding, Places, Directions, etc. are **not** required for this scope.
- Address geocoding can be done two ways: (a) server-side via the Geocoding API web service (recommended, §7.3), or (b) client-side via the Maps JS `Geocoder` service. Option (b) removes the backend route but uses the browser key.

### 7.3 API key handling (read this carefully)
There are effectively **two** key surfaces, and they need different treatment:

1. **Maps JavaScript API key (browser).** This key is loaded in the client and **cannot be fully hidden** — anything the browser uses is visible to the user. Do not design around "hiding" it. Instead:
   - Restrict it by **HTTP referrer** to your Render domain(s) only.
   - Restrict it by **API** to just the Maps JavaScript API.
   - This prevents the key from being usable on other origins even if scraped.
2. **Geocoding key (server).** Keep address geocoding on the backend so this key never reaches the browser:
   - Store the key as a **Render environment variable** (e.g., `GEOCODING_API_KEY`); never commit it.
   - The `/api/geocode` route reads it server-side, calls Google, and returns only lat/long to the client.
   - Restrict this key by **IP** (Render's egress) and by **API** (Geocoding only).

> **Honest tradeoff:** the browser Maps key is exposed by design; referrer + API restriction is the real mitigation, not obfuscation. Only the geocoding call genuinely benefits from a server proxy. If you accept a shared browser key and skip the proxy (client-side geocoding), you lose that isolation and can't IP-restrict, but you drop a backend route. For v1 the marginal cost of the proxy is low, so it's recommended — but it's a defensible either/or.

### 7.4 Where the JSON lives — client download vs. server storage
| Option | Pros | Cons |
|--------|------|------|
| **Client download / upload (recommended v1)** | No persistence layer, no DB, no auth needed; user owns the file; trivially satisfies "save to a JSON file" and "upload a file." | User must manage files manually; no history/listing in-app. |
| **Server-side storage** | Central file list, could support sharing/history later. | Needs storage + likely auth; **Render's default filesystem is ephemeral** and wiped on redeploy/restart, so it requires a **persistent disk add-on** or external object storage (e.g., S3) plus a DB or index. Materially more scope. |

**Recommendation:** client download + upload for v1. Server storage is a clean v2 upgrade if a shared library of saved sets becomes a requirement. *(This is the assumption baked into §2 and §4.)*

### 7.5 Rough component sketch
```
[ Browser SPA ]
  ├─ Tab 1: input controls, Maps JS (satellite + circle + 25 dots),
  │         selection state, targeting-list form, JSON export (Blob download)
  ├─ Tab 2: file input, JSON validate, Maps JS render + 12 markers + info windows
  └─ calls ──► GET /api/geocode?q=<address>  (only for address input)

[ Render Web Service (Node/Express) ]
  ├─ serves static frontend
  └─ /api/geocode ──► Google Geocoding API (key from env, server-side)
```

---

## 8. Non-Functional Requirements

### 8.1 Browser support
Evergreen desktop browsers, latest two versions: Chrome, Edge, Firefox, Safari. *(Assumption: desktop-first; mobile layout is best-effort in v1, not a target.)*

### 8.2 Performance expectations
- 25 markers + 1 circle is trivial for Maps JS; interactions should feel instant.
- Dominant latency is (a) initial Maps JS + tile load and (b) the geocoding round-trip (typically sub-second). Target: map interactive within ~2–3s on a normal connection; geocode result within ~1s. *(Assumption — not hard SLAs.)*
- No heavy computation client-side; dot generation is O(dotCount).

### 8.3 Error & edge-case handling
| Case | Expected behavior |
|------|-------------------|
| **Bad / unresolvable address** | Geocoding returns zero results or an error → show inline message ("Couldn't find that address"); do not move the map. |
| **Missing / invalid lat/long** | Validate ranges before use; empty or out-of-range → inline field error; don't recenter. |
| **Fewer than `minSelections` selected** | Save Targets stays disabled; counter shows `n / maxSelections`. No silent proceed. |
| **More than `maxSelections` selected** | If `blockExtraSelections` is true (default), block the next click. If false, allow extras but keep Save gated to the min–max range. |
| **Incomplete targeting rows** | Export blocked; highlight the offending rows/fields. |
| **Malformed JSON on upload** | Catch parse error → "This file isn't valid JSON." Don't attempt render; clear any previous Review map/list. |
| **Schema-invalid JSON** (valid JSON, wrong shape / missing fields / wrong `targets` length) | Show which check failed (e.g., "expected 12 targets, found 9"); don't render; clear any previous Review map/list. |
| **Geocode backend/network failure** | Surface a retry-able error; app remains usable via click / lat-long input. |
| **Google Maps fails to load** (key/quota/network) | Show a blocking but clear error state rather than a blank tab. |

### 8.4 Security / privacy notes
- No PII collected; target files are user-generated and stay on the user's machine in v1.
- Keys handled per §7.3. No secrets in the client bundle beyond the referrer-restricted Maps JS key.

---

## 9. Phased Implementation Plan

| Phase | Goal | Includes | Exit criteria |
|-------|------|----------|---------------|
| **P0 — Skeleton & hosting** | App deploys and serves. | Render Web Service, static frontend shell, two-tab nav, env var wiring, Maps JS loads with a restricted key. | Blank two-tab app renders a map centered on a hardcoded point on Render. |
| **P1 — Location input + map** | All three center-setting methods work. | Address (via `/api/geocode` proxy), map-click, lat/long entry; radius circle; `fitBounds` zoom; `config/app-config.md` defaults (`hybrid`, miles). | Any of the three inputs correctly centers the map and draws the default radius circle. |
| **P2 — Dot generation + selection** | Candidate dots and shortlist mechanics. | Uniform-disk generation of `dotCount` dots (§5.3) with `minDotSpacingMeters` rejection sampling, click-to-toggle, `selected/N` counter, exact-N gating via `requiredSelections` + `blockExtraSelections`, regenerate on center/radius change, confirm-on-recenter when work would be lost. | User can generate `dotCount` dots and select exactly `requiredSelections`; Save Targets enables only at N; dots do not overlap. |
| **P3 — Metadata + export** | Annotate and save. | Targeting list form (name/confidence/priority), per-row validation, JSON export matching §4 via client download (`seed: null` unless `seededRng`). | A complete, schema-valid JSON file downloads with N annotated targets + center/radius/generation metadata. |
| **P4 — Review tab** | Load and display. | File upload, JSON parse + schema validation, re-render saved center/radius, plot N markers, metadata info windows. | A file exported in P3 loads and renders identically with clickable point details. |
| **P5 — Hardening** | Edge cases + polish. | All error handling from §8.3, browser pass, key-restriction verification, config MD validation messages. | Every §8.3 row behaves as specified; parameters tunable via `config/app-config.md`. |
| **P6 — Admin config** | In-app config editing. | Admin **tab** gated by simple shared credentials (`ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars); login form → HttpOnly session cookie (8h); view/edit §6 parameters (radius, counts, map type, selection gating, spacing, confirm-on-recenter, default center — not `seededRng` / `radiusUnit`); persist by writing `config/app-config.md` on the server; after save, operator must click **Apply & reload**. Tab hidden when credentials unset. | Operator can change those parameters without editing files or redeploying code (note: Render disk is ephemeral until P7). |
| **P7 — Persistent Admin config** | Survive redeploys. | Investigate and adopt **Render persistent disk** (or equivalent) so Admin writes to `config/app-config.md` survive service restarts/redeploys; document mount path + Blueprint changes. | Admin edits remain after redeploy without re-entering values. |

*(Assumption: P0–P6 are sequential; each is independently demoable. Parallelization is possible — e.g., Review tab (P4) can start once the schema (§4) is frozen.)*

---

## 10. Open Questions

### Decided

1. **Q1 — Backend or static?** → Render Web Service + geocode proxy.
2. **Q2 — Storage in v1?** → Client download/upload only.
3. **Q3 — Selection count semantics.** → Range: at least `minSelections`, at most `maxSelections` (defaults 1–12). Save enables when count is in range. `blockExtraSelections` (default `true`) blocks selecting above max; when `false`, extras are allowed but Save stays gated. Configurable in `config/app-config.md`; Admin UI in P6.
4. **Q5 — Losing work on recenter.** → Yes, confirm when change would clear selection / regenerate dots (`confirmOnRecenter`).
5. **Q6 / config delivery.** → MD file now (`config/app-config.md`); Admin section in **P6**.
6. **Q7 — Map type default.** → `hybrid`.
7. **Q8 — Review metadata display.** → Yes, show name/confidence/priority on point click (P4).
8. **Q9 — Seeded RNG.** → Unseeded; export `seed: null` (`seededRng: false`).
9. **Q10 — Units.** → Miles only in v1 (`radiusUnit: miles`), configurable for a later unit expansion.
10. **Q4 — Dot overlap.** → Close allowed; overlap not. Rejection sampling with `minDotSpacingMeters` (default 50).
11. **P6 Admin auth.** → Simple shared `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars (Render + `.env`). No OAuth/SSO in v1.
12. **P6 Admin UX.** → Third **Admin** tab (hidden when credentials unset). Login form → signed HttpOnly session cookie. Editable: radius, counts, block extras, spacing, map type, confirm-on-recenter, default center. Read-only in UI: `radiusUnit`, `seededRng`. Save writes `config/app-config.md`; **Apply & reload** required for the open browser. Disk persist across Render redeploys deferred to **P7**.
13. **P7.** → Render persistent disk (investigate) so Admin MD writes survive redeploy.

---

### Requirements checklist (self-audit)
- [x] One-paragraph summary before detailed sections
- [x] Overview: what it does + who it's for
- [x] Both tab flows as step-by-step acceptance criteria
- [x] Functional requirements: all three location inputs, map/satellite render, random dot generation, selection mechanics, metadata form, JSON save/load
- [x] Concrete data model: JSON schema with field names, types, and a filled-in 12-target example
- [x] Configurable parameters called out with defaults (radius=3mi, dotCount=25, requiredSelections=12)
- [x] Architecture/tech notes: Render hosting, specific Google APIs (Maps JS + Geocoding), API key handling (browser vs server, referrer/IP restrictions), JSON storage tradeoff
- [x] Non-functional: browser support, performance, error/edge cases (bad address, no lat/long, <12 selected, malformed JSON)
- [x] Open-questions section
- [x] Phased implementation plan (requested in the brief's opening line)
- [x] Ambiguities resolved with inline assumptions; scope held to the described feature set

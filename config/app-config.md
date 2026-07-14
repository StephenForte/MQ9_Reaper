---
radiusMiles: 3
dotCount: 25
minSelections: 1
maxSelections: 12
blockExtraSelections: true
minDotSpacingMeters: 50
mapType: hybrid
radiusUnit: miles
confirmOnRecenter: true
seededRng: false
defaultCenterLat: 37.7996
defaultCenterLng: -121.7124
---

# App Config

Human-editable runtime defaults for MQ9 Reaper. Edit here **or** use the in-app **Admin** tab when `ADMIN_USERNAME` / `ADMIN_PASSWORD` are set.

On Render (P7), Admin writes `/var/data/app-config.md` on the persistent disk (`CONFIG_PATH`). First boot copies this repo file onto the disk if missing; later Admin edits survive redeploy. Locally, without `CONFIG_PATH`, the server uses this file. After Admin save, click **Apply & reload** in the UI. Manual file edits still require a server restart.

## Fields

| Key | Meaning |
|-----|---------|
| `radiusMiles` | Default radius (> 0). Unit is miles (`radiusUnit`); km toggle is out of scope for v1. |
| `dotCount` | Candidate targets generated when the operator clicks **Load targets**. Must be greater than `maxSelections`. |
| `minSelections` | Minimum targets that must be selected before Save Targets (default 1). |
| `maxSelections` | Maximum targets allowed in a valid shortlist (default 12). Save enables when selected count is within `[min, max]`. |
| `blockExtraSelections` | If `true` (default), block selecting above `maxSelections`. If `false`, allow extras but keep Save gated to the min–max range. |
| `minDotSpacingMeters` | Minimum distance between candidate targets. Close is allowed, overlap is not; rejection sampling retries until spaced. |
| `mapType` | `hybrid` (imagery + labels) or `satellite`. |
| `radiusUnit` | `miles` only in v1. |
| `confirmOnRecenter` | If `true`, changing center/radius or reloading targets prompts when ≥1 target is selected. |
| `seededRng` | If `false`, export writes `seed: null`. Seeded RNG is not planned for v1. |
| `defaultCenterLat` / `defaultCenterLng` | Startup map center before Selection is set; Review uses the uploaded file’s center after load. |

## Invariant

`minSelections` ≤ `maxSelections` < `dotCount`.

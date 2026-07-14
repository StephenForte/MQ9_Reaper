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

Human-editable runtime defaults for MQ9 Reaper. Edit here **or** use the in-app **Admin** tab (P6) when `ADMIN_USERNAME` / `ADMIN_PASSWORD` are set. Admin writes this same file; click **Apply & reload** in the UI after saving. Manual file edits still require a server restart.

On Render without a persistent disk, Admin writes may be lost on redeploy (see PRD **P7**).

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

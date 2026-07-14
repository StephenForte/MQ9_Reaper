---
radiusMiles: 3
dotCount: 25
minSelections: 1
maxSelections: 12
minDotSpacingMeters: 50
mapType: hybrid
radiusUnit: miles
confirmOnRecenter: true
seededRng: false
defaultCenterLat: 37.7996
defaultCenterLng: -121.7124
---

# App Config

Human-editable runtime defaults for MQ9 Reaper. **Restart the server** after changing values.

Later: an **Admin** section in the app will edit these in-app (see PRD phase **P6**). Until then, this file is the source of truth — `config.js` loads it.

## Fields

| Key | Meaning |
|-----|---------|
| `radiusMiles` | Default radius (> 0). Unit is miles (`radiusUnit`); km toggle is out of scope for v1. |
| `dotCount` | Candidate targets generated when the operator clicks **Load targets**. Must be greater than `maxSelections`. |
| `minSelections` | Minimum targets that must be selected before Save Targets (default 1). |
| `maxSelections` | Maximum selectable targets; selecting above this is blocked (default 12). |
| `minDotSpacingMeters` | Minimum distance between candidate targets. Close is allowed, overlap is not; rejection sampling retries until spaced. |
| `mapType` | `hybrid` (imagery + labels) or `satellite`. |
| `radiusUnit` | `miles` only in v1. |
| `confirmOnRecenter` | If `true`, changing center/radius or reloading targets prompts when ≥1 target is selected. |
| `seededRng` | If `false`, export writes `seed: null`. Seeded RNG is not planned for v1. |
| `defaultCenterLat` / `defaultCenterLng` | Startup / Review-placeholder map center. |

## Invariant

`minSelections` ≤ `maxSelections` < `dotCount`.

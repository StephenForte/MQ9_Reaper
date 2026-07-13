---
radiusMiles: 3
dotCount: 25
requiredSelections: 12
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

Human-editable runtime defaults for MQ9 Reaper. **Restart the server** after changing values.

Later: an **Admin** section in the app will edit these in-app (see PRD phase **P6**). Until then, this file is the source of truth — `config.js` loads it.

## Fields

| Key | Meaning |
|-----|---------|
| `radiusMiles` | Default radius (> 0). Unit is miles (`radiusUnit`); km toggle is out of scope for v1. |
| `dotCount` | Candidate dots generated when the operator clicks **Load dots**. Must be greater than `requiredSelections`. |
| `requiredSelections` | How many dots must be selected before Save Targets. |
| `blockExtraSelections` | If `true`, selecting above `requiredSelections` is blocked (exact-N). If `false`, extras allowed but Save stays gated to exact N. |
| `minDotSpacingMeters` | Minimum distance between candidate dots. Dots may be close, but must not overlap; rejection sampling retries until spaced. |
| `mapType` | `hybrid` (imagery + labels) or `satellite`. |
| `radiusUnit` | `miles` only in v1. |
| `confirmOnRecenter` | If `true`, changing center/radius or reloading dots prompts when ≥1 candidate is selected. |
| `seededRng` | If `false`, export writes `seed: null`. Seeded RNG is not planned for v1. |
| `defaultCenterLat` / `defaultCenterLng` | Startup / Review-placeholder map center. |

## Invariant

`requiredSelections` must be `<` `dotCount`.

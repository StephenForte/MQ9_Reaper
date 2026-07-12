/**
 * Build-time / server defaults (PRD §6).
 * Edit here until a settings UI exists (Phase 5 / open Q6).
 */
const appConfig = {
  radiusMiles: 3,
  dotCount: 25,
  requiredSelections: 12,
  mapType: 'satellite', // 'satellite' | 'hybrid'
  /** Hardcoded Phase 0 center (PRD example area). */
  defaultCenter: {
    lat: 37.7996,
    lng: -121.7124,
  },
};

if (!(appConfig.requiredSelections < appConfig.dotCount)) {
  throw new Error('Config invariant failed: requiredSelections must be < dotCount');
}

module.exports = { appConfig };

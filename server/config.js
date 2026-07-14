// Shared server-side configuration constants.
//
// Single source of truth for values that would otherwise be duplicated across
// route modules. Keeping them here means a change (e.g. wiring in a live FX
// source later) touches exactly one place.

// Fallback AUD/USD conversion rate, used only when the live rate (lib/fx.js,
// sourced from Yahoo Finance) is unreachable and there's no cached rate yet
// (e.g. right after process start). Update this occasionally so the
// fallback stays in the right ballpark, but it's a safety net, not the rate
// actually used in normal operation.
const USD_TO_AUD = 1.55;

module.exports = { USD_TO_AUD };

// Shared server-side configuration constants.
//
// Single source of truth for values that would otherwise be duplicated across
// route modules. Keeping them here means a change (e.g. wiring in a live FX
// source later) touches exactly one place.

// Fixed AUD/USD conversion rate. WealthCanvas exposes only average cost +
// quantity (no live prices/FX), so USD positions are converted with this
// hardcoded fallback until a live price/FX source is wired in (later block).
const USD_TO_AUD = 1.55;

module.exports = { USD_TO_AUD };

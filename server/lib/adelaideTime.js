// Adelaide is UTC+9:30 year-round (no DST).
const OFFSET_MS = (9 * 60 + 30) * 60 * 1000;

function todayAdelaide() {
  return new Date(Date.now() + OFFSET_MS).toISOString().slice(0, 10);
}

// Returns UTC 'YYYY-MM-DD HH:MM:SS' bounds for a given Adelaide-local date
// string, suitable for SQLite datetime comparisons.
function adelaideDayBounds(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const fmt = (dt) => dt.toISOString().replace('T', ' ').slice(0, 19);
  return {
    start: fmt(new Date(Date.UTC(y, m - 1, d)     - OFFSET_MS)),
    end:   fmt(new Date(Date.UTC(y, m - 1, d + 1) - OFFSET_MS)),
  };
}

module.exports = { todayAdelaide, adelaideDayBounds };

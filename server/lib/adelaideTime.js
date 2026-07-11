// Adelaide observes DST (ACST UTC+9:30 → ACDT UTC+10:30, Oct–Apr), so a fixed
// offset is wrong for roughly half the year. Intl.DateTimeFormat resolves the
// correct offset for any given instant without pulling in a tz database dep.
const ADELAIDE_TZ = 'Australia/Adelaide';

function todayAdelaide() {
  // en-CA locale formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ADELAIDE_TZ }).format(new Date());
}

// UTC offset (ms) Adelaide observes at the given instant, accounting for DST.
function getAdelaideOffsetMs(date) {
  const asUtc = (tz) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    // formatToParts reports hour '24' at midnight for hour12:false; normalise.
    const hour = get('hour') % 24;
    return Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  };
  return asUtc(ADELAIDE_TZ) - asUtc('UTC');
}

// Returns UTC 'YYYY-MM-DD HH:MM:SS' bounds for a given Adelaide-local date
// string, suitable for SQLite datetime comparisons (matches datetime('now')).
function adelaideDayBounds(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Use midday on the target date to compute the offset — safely inside the
  // date's own DST regime regardless of when the transition happens.
  const middayUTC = new Date(Date.UTC(year, month - 1, day, 2, 30, 0));
  const offsetMs = getAdelaideOffsetMs(middayUTC);
  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs;
  const fmt = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  return {
    start: fmt(startMs),
    end: fmt(startMs + 24 * 60 * 60 * 1000),
  };
}

module.exports = { todayAdelaide, adelaideDayBounds };

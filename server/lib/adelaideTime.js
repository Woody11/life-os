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

// Offset (ms) Adelaide observes at local midnight of the given date. DST
// transitions happen at 2am/3am local time, so the offset in effect at
// midnight can't be read off directly — it's resolved with a fixed-point
// step: guess using UTC-as-if-local, then re-read the offset at that
// corrected instant. One iteration is sufficient since Adelaide's DST rules
// only ever produce a single transition per calendar day.
function offsetAtLocalMidnightMs(year, month, day) {
  const guessMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  const guessOffsetMs = getAdelaideOffsetMs(new Date(guessMs));
  return getAdelaideOffsetMs(new Date(guessMs - guessOffsetMs));
}

// Returns UTC 'YYYY-MM-DD HH:MM:SS' bounds for a given Adelaide-local date
// string, suitable for SQLite datetime comparisons (matches datetime('now')).
function adelaideDayBounds(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Start and end offsets are resolved independently (rather than assuming
  // the day is a fixed 24h span) because Adelaide has 23h/25h days at DST
  // transitions.
  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetAtLocalMidnightMs(year, month, day);
  const endMs = Date.UTC(year, month - 1, day + 1, 0, 0, 0) - offsetAtLocalMidnightMs(year, month, day + 1);

  const fmt = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  return {
    start: fmt(startMs),
    end: fmt(endMs),
  };
}

module.exports = { todayAdelaide, adelaideDayBounds };

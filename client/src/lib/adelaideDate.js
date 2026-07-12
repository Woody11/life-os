const ADELAIDE_TZ = 'Australia/Adelaide';

// Adelaide-local calendar date as YYYY-MM-DD. `new Date().toISOString()` gives
// the UTC date instead, which lags Adelaide by 9.5-10.5h — for roughly the
// first third of the Adelaide day (midnight to ~9-10am) that silently returns
// yesterday's date, breaking "today" comparisons (overdue goals, habit
// streaks, morning-brief freshness) right when they matter most.
export function todayAdelaide() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ADELAIDE_TZ }).format(new Date());
}

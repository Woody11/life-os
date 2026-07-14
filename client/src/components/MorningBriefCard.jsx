import { useEffect, useState } from 'react';
import { todayAdelaide } from '../lib/adelaideDate';
import { Sun } from 'lucide-react';

function isToday(isoStr) {
  if (!isoStr) return false;
  // Compare date portion only — brief's generated_at may include Adelaide offset
  return isoStr.slice(0, 10) === todayAdelaide();
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function MorningBriefCard() {
  const [brief, setBrief]       = useState(null);
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch('/api/google/cache/morning_brief')
      .then((r) => r.ok ? r.json() : null)
      .then((res) => {
        const data = res?.data ?? null;
        setBrief(data);
        setOpen(isToday(data?.generated_at));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !brief) return null;

  const today = isToday(brief.generated_at);
  const staleLabel = !today ? (
    <span className="ml-2 text-[10px] text-amber-500/70">yesterday's brief</span>
  ) : null;

  return (
    <div className="mb-8 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <Sun className="h-5 w-5 text-amber-400" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Morning Brief</span>
              {staleLabel}
            </div>
            {!open && brief.summary_text && (
              <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{brief.summary_text}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {brief.generated_at && (
            <span className="text-[10px] text-slate-600">{formatTime(brief.generated_at)}</span>
          )}
          <span className="text-slate-500 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-white/5 pt-4">
          {brief.summary_text && (
            <p className="text-sm text-slate-300">{brief.summary_text}</p>
          )}

          {brief.weather_summary && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Weather</p>
              <p className="text-sm text-slate-400">{brief.weather_summary}</p>
            </div>
          )}

          {brief.top_events?.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Today's Events</p>
              <div className="space-y-1">
                {brief.top_events.map((ev, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="w-10 shrink-0 text-indigo-400 tabular-nums">{ev.time}</span>
                    <span className="text-slate-300">{ev.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {brief.priority_emails?.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Priority Emails</p>
              <div className="space-y-1">
                {brief.priority_emails.map((em, i) => (
                  <div key={i} className="text-sm flex flex-wrap items-baseline gap-x-1.5">
                    {em.account && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-indigo-500/20 text-indigo-300">{em.account}</span>
                    )}
                    <span className="font-medium text-slate-300">{em.from}</span>
                    <span className="text-slate-500">— {em.subject}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {brief.smsf_overnight_change && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">SMSF Overnight</p>
              <p className={`text-sm font-semibold ${brief.smsf_overnight_change.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {brief.smsf_overnight_change.pct >= 0 ? '+' : ''}{brief.smsf_overnight_change.pct?.toFixed(2)}%
                {brief.smsf_overnight_change.value_aud != null && (
                  <span className="ml-2 font-normal text-slate-400">
                    ({brief.smsf_overnight_change.value_aud >= 0 ? '+' : ''}
                    {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(brief.smsf_overnight_change.value_aud)})
                  </span>
                )}
              </p>
            </div>
          )}

          {brief.pending_dispatches?.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Pending Dispatches</p>
              <div className="space-y-1">
                {brief.pending_dispatches.map((d, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="shrink-0 font-medium text-slate-300">{d.agent}</span>
                    <span className="truncate text-slate-500">{d.prompt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

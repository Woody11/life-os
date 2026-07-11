import { useEffect, useRef, useState, useCallback } from 'react';
import { HashRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import HomeTab     from './tabs/HomeTab.jsx';
import SmsfTab     from './tabs/SmsfTab.jsx';
import MbsTab      from './tabs/MbsTab.jsx';
import DispatchTab from './tabs/DispatchTab.jsx';
import KanbanTab   from './tabs/KanbanTab.jsx';
import HabitsTab   from './tabs/HabitsTab.jsx';
import GoalsTab    from './tabs/GoalsTab.jsx';

const TABS = [
  { to: '/',         label: 'Home',     end: true },
  { to: '/smsf',     label: 'SMSF' },
  { to: '/mbs',      label: 'MBS' },
  { to: '/dispatch', label: 'Dispatch' },
  { to: '/kanban',   label: 'Kanban' },
  { to: '/habits',   label: 'Habits' },
  { to: '/goals',    label: 'Goals' },
];

const THEME_KEY = 'lifeos-theme';

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.body.classList.toggle('theme-light', theme === 'light');
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore storage errors */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return [theme, toggleTheme];
}

function SunIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function BellIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function MenuIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function XIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

const RESULT_ICONS = {
  dispatch: '📨',
  kanban: '🗂️',
  goal: '🎯',
  habit: '🔥',
};

const RESULT_ROUTES = {
  dispatch: '/dispatch',
  kanban: '/kanban',
  goal: '/goals',
  habit: '/habits',
};

function SearchOverlay({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  if (!open) return null;

  const grouped = (results || []).reduce((acc, r) => {
    const type = r.type || 'other';
    (acc[type] = acc[type] || []).push(r);
    return acc;
  }, {});

  function goTo(result) {
    const base = RESULT_ROUTES[result.type] || '/';
    navigate(base);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-sm px-4 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border-color)] px-4 py-3">
          <SearchIcon className="h-5 w-5 text-[var(--text-secondary)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dispatches, kanban cards, goals, habits..."
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none"
          />
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {loading && (
            <p className="px-3 py-4 text-sm text-[var(--text-secondary)]">Searching…</p>
          )}
          {!loading && query.trim() && results && results.length === 0 && (
            <p className="px-3 py-4 text-sm text-[var(--text-secondary)]">No results for "{query}"</p>
          )}
          {!loading && Object.keys(grouped).map((type) => (
            <div key={type} className="mb-2">
              <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                {type}
              </p>
              {grouped[type].map((r, i) => (
                <button
                  key={r.id || i}
                  onClick={() => goTo(r)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                >
                  <span>{RESULT_ICONS[r.type] || '•'}</span>
                  <span className="truncate">{r.title || r.name || r.label || 'Untitled'}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function useAlerts() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [goalsRes, habitsRes] = await Promise.all([
          fetch('/api/goals'),
          fetch('/api/habits'),
        ]);
        const goalsData = await goalsRes.json();
        const habitsData = await habitsRes.json();
        if (cancelled) return;

        const goals = goalsData?.goals ?? (Array.isArray(goalsData) ? goalsData : []);
        const habits = habitsData?.habits ?? (Array.isArray(habitsData) ? habitsData : []);

        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const isPast8pm = today.getHours() >= 20;

        const next = [];
        goals.forEach((g) => {
          if (g.status === 'active' && g.target_date && g.target_date < todayStr) {
            next.push({
              id: `goal-${g.id}`,
              kind: 'goal',
              text: `Overdue goal: ${g.title || 'Untitled goal'}`,
            });
          }
        });
        if (isPast8pm) {
          habits.forEach((h) => {
            if (h.current_streak === 0) {
              next.push({
                id: `habit-${h.id}`,
                kind: 'habit',
                text: `Not done today: ${h.name || h.title || 'Untitled habit'}`,
              });
            }
          });
        }
        setAlerts(next);
      } catch {
        if (!cancelled) setAlerts([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return alerts;
}

function NotificationBell() {
  const alerts = useAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        aria-label="Notifications"
      >
        <BellIcon className="h-5 w-5" />
        {alerts.length > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-2 shadow-2xl">
          {alerts.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--text-secondary)]">No alerts</p>
          ) : (
            alerts.map((a) => (
              <div key={a.id} className="rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
                {a.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MobileDrawer({ open, onClose }) {
  const location = useLocation();

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <div
      className={[
        'fixed inset-0 z-[90] md:hidden transition-opacity duration-200',
        open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
      ].join(' ')}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={[
          'absolute left-0 top-0 h-full w-72 max-w-[80vw] transform bg-[var(--bg-app)] border-r border-[var(--border-color)] shadow-2xl transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--border-color)]">
          <span className="text-sm font-semibold tracking-widest text-[var(--text-heading)] uppercase">
            Life OS
          </span>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-1 p-3">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                [
                  'rounded-lg px-4 py-3 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                ].join(' ')
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

function NavBar({ theme, toggleTheme }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-app)_80%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center px-4 md:px-6">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="mr-2 flex md:hidden items-center justify-center rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            aria-label="Open menu"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          {/* Brand */}
          <div className="mr-8 flex items-center gap-2 py-3.5">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30" />
            <span className="text-sm font-semibold tracking-widest text-[var(--text-heading)] uppercase">
              Life OS
            </span>
          </div>

          {/* Tabs (desktop) */}
          <div className="hidden md:flex flex-1 overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {TABS.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    [
                      'relative px-4 py-3.5 text-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      {t.label}
                      {isActive && (
                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>

          <div className="flex-1 md:hidden" />

          {/* Actions */}
          <div className="flex items-center gap-1 py-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              aria-label="Search"
            >
              <SearchIcon className="h-5 w-5" />
            </button>
            <NotificationBell />
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

export default function App() {
  const [theme, toggleTheme] = useTheme();

  return (
    <HashRouter>
      <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
        <NavBar theme={theme} toggleTheme={toggleTheme} />
        <main>
          <Routes>
            <Route path="/"        element={<HomeTab />} />
            <Route path="/smsf"    element={<SmsfTab />} />
            <Route path="/mbs"     element={<MbsTab />} />
            <Route path="/dispatch" element={<DispatchTab />} />
            <Route path="/kanban"  element={<KanbanTab />} />
            <Route path="/habits"  element={<HabitsTab />} />
            <Route path="/goals"   element={<GoalsTab />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

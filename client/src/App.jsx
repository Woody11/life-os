// Block 1 shell: tab-based layout with client-side routing.
//
// HashRouter (not BrowserRouter) so the SPA needs no server-side route handling
// — Express only ever serves index.html at "/" and the hash fragment drives the
// active tab entirely in the browser.
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import HomeTab from './tabs/HomeTab.jsx';

// Placeholder tabs — filled in by later blocks. Kept inline (tiny, no logic).
const Placeholder = ({ block }) => (
  <div className="p-8 text-gray-400">Coming in Block {block}...</div>
);

const TABS = [
  { to: '/', label: 'Home', end: true },
  { to: '/smsf', label: 'SMSF' },
  { to: '/mbs', label: 'MBS' },
  { to: '/dispatch', label: 'Dispatch' },
  { to: '/kanban', label: 'Kanban' },
];

function NavBar() {
  return (
    <nav className="flex gap-1 border-b border-slate-800 bg-slate-900 px-4">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            [
              'px-4 py-3 text-sm font-medium transition-colors',
              isActive
                ? 'border-b-2 border-sky-400 text-white'
                : 'border-b-2 border-transparent text-slate-400 hover:text-slate-200',
            ].join(' ')
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <NavBar />
        <main>
          <Routes>
            <Route path="/" element={<HomeTab />} />
            <Route path="/smsf" element={<Placeholder block={2} />} />
            <Route path="/mbs" element={<Placeholder block={3} />} />
            <Route path="/dispatch" element={<Placeholder block={4} />} />
            <Route path="/kanban" element={<Placeholder block={5} />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

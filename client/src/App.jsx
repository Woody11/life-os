import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import HomeTab     from './tabs/HomeTab.jsx';
import SmsfTab     from './tabs/SmsfTab.jsx';
import MbsTab      from './tabs/MbsTab.jsx';
import DispatchTab from './tabs/DispatchTab.jsx';
import KanbanTab   from './tabs/KanbanTab.jsx';

const TABS = [
  { to: '/',        label: 'Home',     end: true },
  { to: '/smsf',    label: 'SMSF' },
  { to: '/mbs',     label: 'MBS' },
  { to: '/dispatch', label: 'Dispatch' },
  { to: '/kanban',  label: 'Kanban' },
];

function NavBar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#080c14]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center px-6">
        {/* Brand */}
        <div className="mr-8 flex items-center gap-2 py-3.5">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30" />
          <span className="text-sm font-semibold tracking-widest text-white/70 uppercase">
            Life OS
          </span>
        </div>

        {/* Tabs */}
        <div className="flex flex-1 gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                [
                  'relative px-4 py-3.5 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200',
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
    </nav>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-[#080c14] text-slate-100">
        <NavBar />
        <main>
          <Routes>
            <Route path="/"        element={<HomeTab />} />
            <Route path="/smsf"    element={<SmsfTab />} />
            <Route path="/mbs"     element={<MbsTab />} />
            <Route path="/dispatch" element={<DispatchTab />} />
            <Route path="/kanban"  element={<KanbanTab />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

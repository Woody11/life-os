// Block 0 shell. Intentionally minimal: a header and a placeholder.
// Tabs, routing, and data views arrive in Block 1+. Keep this dumb for now.
export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-2xl font-semibold tracking-tight">Life OS</h1>
      </header>
      <main className="flex items-center justify-center px-6 py-24">
        <p className="text-slate-400">Loading…</p>
      </main>
    </div>
  );
}

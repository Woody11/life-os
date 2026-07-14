// Shared visual shell for a single Kanban-style column. Used by both the
// Kanban tab (user-draggable, fixed-width, horizontally-scrolling board) and
// the Dispatch tab (static equal-width agent status pipeline, no drag) so
// both read as the same component instead of two differently-styled boards.
// The two tabs differ in interaction model (draggable vs static) and column
// width (fixed vs flex-fill) — those stay caller-controlled via props; only
// the shared visual language (corner radius, border/header treatment, count
// badge, empty state) lives here.
export default function KanbanColumnShell({
  label,
  labelClassName = 'text-slate-400',
  accessory,
  count,
  width = 'flex-1 min-w-0',
  active = false,
  bodyRef,
  emptyText = '—',
  isEmpty,
  children,
}) {
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border transition-colors ${
        active ? 'border-indigo-500/40 bg-indigo-500/[0.06]' : 'border-white/5 bg-white/[0.02]'
      } ${width}`}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
        <span className={`text-xs font-semibold uppercase tracking-wider ${labelClassName}`}>{label}</span>
        {accessory ?? (count != null && (
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{count}</span>
        ))}
      </div>
      <div ref={bodyRef} className="min-h-16 flex-1 space-y-2 overflow-y-auto p-2">
        {children}
        {isEmpty && <p className="px-1 py-3 text-center text-[11px] text-slate-700">{emptyText}</p>}
      </div>
    </div>
  );
}

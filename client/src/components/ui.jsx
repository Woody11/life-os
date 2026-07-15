export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-white/5 bg-white/[0.03] p-6 ${className}`}>
      {children}
    </div>
  );
}

// Bare skeleton — no vertical padding. Use inside a Card or other container
// that already provides its own spacing. Pulsing placeholder bars read as
// "content is arriving here" rather than a spinner's context-free wait.
export function Skeleton({ label = 'Loading…' }) {
  return (
    <div className="space-y-2.5" role="status" aria-label={label}>
      <div className="h-4 w-5/6 animate-pulse rounded bg-white/5" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-white/5" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-white/5" />
    </div>
  );
}

// Padded skeleton for standalone use directly inside a section (not wrapped
// in a Card).
export function SectionSkeleton({ label = 'Loading…' }) {
  return (
    <div className="py-8">
      <Skeleton label={label} />
    </div>
  );
}

// Compact inline error — message and retry button side by side. Meant to be
// wrapped in a Card by the caller.
export function ErrorBox({ message, onRetry }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-300">
      <span className="text-sm">{message || 'Something went wrong.'}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// Stacked standalone error box (own border/background) for sections that
// aren't already inside a Card.
export function SectionError({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
      <div>{message || 'Something went wrong.'}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
        >
          Retry
        </button>
      )}
    </div>
  );
}

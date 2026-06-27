// Shared admin UI primitives — consistent corporate look across every page:
// loading skeletons, empty-states with a call-to-action, and a KPI stat card
// with period-over-period trend deltas.
import { Link } from 'react-router-dom';

/** Animated placeholder block shown while data loads (replaces "Loading…"). */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-white/10 ${className}`} />;
}

/** A grid of skeleton stat cards — drop-in while a dashboard/list loads. */
export function SkeletonStats({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton rows for a table body while it loads. */
export function SkeletonRows({ rows = 6, cols = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Friendly empty-state with an optional primary action. */
export function EmptyState({ icon = '∅', title, hint, actionLabel, actionTo, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
      <div className="mb-3 text-4xl text-muted/60" aria-hidden>{icon}</div>
      <h3 className="font-display uppercase tracking-wide text-body">{title}</h3>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn-primary mt-4 px-4 py-2 text-sm">{actionLabel}</Link>
      )}
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary mt-4 px-4 py-2 text-sm">{actionLabel}</button>
      )}
    </div>
  );
}

/**
 * KPI card with an optional period-over-period delta.
 * `delta` is the raw change vs the previous period; `deltaGood` flips the
 * colour semantics for metrics where "down is good" (e.g. churn).
 */
export function StatCard({ label, value, to, delta, deltaGood = true }) {
  const hasDelta = delta !== undefined && delta !== null && !Number.isNaN(delta);
  const up = Number(delta) > 0;
  const flat = Number(delta) === 0;
  const positive = deltaGood ? up : !up;
  const deltaCls = flat ? 'text-muted' : positive ? 'text-success' : 'text-error';
  const arrow = flat ? '→' : up ? '▲' : '▼';

  const inner = (
    <>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{label}</span>
        {to && <span className="text-accent opacity-0 transition group-hover:opacity-100">→</span>}
      </div>
      <div className="mt-2 font-display text-3xl text-body">{value}</div>
      {hasDelta && (
        <div className={`mt-1 text-xs font-medium ${deltaCls}`}>
          {arrow} {Math.abs(Number(delta)).toLocaleString('en-ZA')} <span className="text-muted">vs last period</span>
        </div>
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="card group transition hover:border-accent/40 hover:bg-surface">{inner}</Link>
    );
  }
  return <div className="card">{inner}</div>;
}

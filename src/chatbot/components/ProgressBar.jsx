// Progress indicator: "Step X of 11 · Section Title" + a filled bar.
import { SECTION_TITLES } from '../flow.js';

export default function ProgressBar({ section, total }) {
  const pct = Math.round((section / total) * 100);
  const title = SECTION_TITLES[section - 1] || '';
  return (
    <div className="px-4 pb-3 pt-4">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-display uppercase tracking-wider text-accent">
          Step {section} of {total}
        </span>
        <span className="text-muted">{title}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

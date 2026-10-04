import {
  type Category,
  SEVERITIES,
  SEVERITY_LABELS,
  type Severity,
  severityHint,
  severitySchema,
} from '@sonrisa/shared';
import { SEVERITY_TILE } from '@/lib/labels';
import { cn } from '@/lib/utils';

/**
 * Minimum-Severity slider. A native range input does the work (keyboard, touch, screen readers);
 * the five tiles underneath show the ramp, and levels below the minimum fade out. The hint says
 * what the number means in the source's own terms, e.g. "M6 and above" (plan S6, D18).
 */
export function SeverityScale({
  id,
  value,
  onChange,
  category,
}: {
  id: string;
  value: Severity;
  onChange: (severity: Severity) => void;
  category: Category;
}) {
  const hint = severityHint(category, value);
  const valueText = `${String(value)} or higher, ${SEVERITY_LABELS[value]}${hint ? `: ${hint}` : ''}`;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <output htmlFor={id} className="font-heading text-2xl text-forest" aria-live="polite">
          {value}+ {SEVERITY_LABELS[value]}
        </output>
        <span className="text-sm text-muted-foreground">
          {hint ?? 'Set by an Admin for simulated Events'}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        aria-valuetext={valueText}
        className="severity-range w-full"
        onChange={(event) => {
          const parsed = severitySchema.safeParse(Number(event.target.value));
          if (parsed.success) onChange(parsed.data);
        }}
      />
      <ol className="grid grid-cols-5 gap-1" aria-hidden="true">
        {SEVERITIES.map((level) => (
          <li key={level} className="grid gap-1">
            <button
              type="button"
              tabIndex={-1}
              className={cn(
                'h-9 font-heading text-sm transition-opacity',
                SEVERITY_TILE[level],
                level < value && 'opacity-25',
              )}
              onClick={() => {
                onChange(level);
              }}
            >
              {level}
            </button>
            {/* Too tight on phones; the output above already names the chosen level. */}
            <span
              className={cn(
                'hidden text-xs sm:block',
                level < value ? 'text-muted-foreground' : 'text-forest',
              )}
            >
              {SEVERITY_LABELS[level]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

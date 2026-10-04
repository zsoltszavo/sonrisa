import { SEVERITY_LABELS, type Severity } from '@sonrisa/shared';
import { SEVERITY_TILE } from '@/lib/labels';
import { cn } from '@/lib/utils';

/** A square tile with the Severity number in display type; the label is for screen readers or shown beside. */
export function SeverityBadge({
  severity,
  showLabel = false,
  className,
}: {
  severity: Severity;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'inline-flex size-9 shrink-0 items-center justify-center font-heading text-base font-medium',
          SEVERITY_TILE[severity],
        )}
        aria-hidden="true"
      >
        {severity}
      </span>
      <span className={showLabel ? 'text-sm' : 'sr-only'}>
        {showLabel
          ? SEVERITY_LABELS[severity]
          : `Severity ${String(severity)}, ${SEVERITY_LABELS[severity]}`}
      </span>
    </span>
  );
}

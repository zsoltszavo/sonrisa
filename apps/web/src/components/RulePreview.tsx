import { formatAgo } from '@/lib/labels';
import type { RulePreviewData } from '@/lib/rule-preview';
import { SeverityBadge } from './Severity';
import { ErrorState } from './States';

const SHOWN = 6;

/** Live preview (D14), from `useRulePreview`. Read-only: it never notifies; rules have no backfill (D6). */
/** One-line count next to the controls on phones, where the full preview sits below the form. */
export function RulePreviewSummary({ preview }: { preview: RulePreviewData }) {
  const { events, matched, categoryName } = preview;
  if (!events.data || events.data.length === 0) return null;
  return (
    <p className="bg-mist px-4 py-3 text-sm lg:hidden">
      <strong className="font-heading font-medium text-forest">{matched.length}</strong> of the last{' '}
      {events.data.length} {categoryName} would have matched.{' '}
      <a href="#preview-title" className="underline">
        See the preview
      </a>
    </p>
  );
}

export function RulePreview({ preview }: { preview: RulePreviewData }) {
  const { events, matched, categoryName } = preview;

  return (
    <section
      aria-labelledby="preview-title"
      className="grid content-start gap-4 bg-mist p-5 sm:p-6"
    >
      <h2 id="preview-title" className="text-xl">
        Preview
      </h2>
      {events.isPending ? (
        <p role="status" className="text-sm">
          Loading recent {categoryName}…
        </p>
      ) : events.isError ? (
        <ErrorState
          title="The preview didn't load"
          error={events.error}
          onRetry={() => void events.refetch()}
        />
      ) : events.data.length === 0 ? (
        <p className="text-sm">
          No {categoryName} have arrived yet, so there is nothing to preview. The rule still works
          for new Events.
        </p>
      ) : (
        <>
          <p aria-live="polite" className="text-[15px]">
            <strong className="font-heading text-3xl font-medium text-forest">
              {matched.length}
            </strong>{' '}
            of the last {events.data.length} {categoryName} would have matched.
          </p>
          {matched.length === 0 ? (
            <p className="text-sm">Try a lower Severity or different keywords.</p>
          ) : (
            <ul className="grid gap-2" aria-label="Matching Events">
              {matched.slice(0, SHOWN).map((event) => (
                <li
                  key={event.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 bg-white p-3"
                >
                  <SeverityBadge severity={event.severity} />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug font-bold break-words">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.location && <>{event.location}, </>}
                      {formatAgo(event.occurredAt)}
                    </p>
                  </div>
                </li>
              ))}
              {matched.length > SHOWN && (
                <li className="text-sm text-muted-foreground">and {matched.length - SHOWN} more</li>
              )}
            </ul>
          )}
        </>
      )}
      <p className="border-t border-forest/15 pt-3 text-xs text-muted-foreground">
        Preview only. Saving a rule never sends alerts about Events that already happened.
      </p>
    </section>
  );
}

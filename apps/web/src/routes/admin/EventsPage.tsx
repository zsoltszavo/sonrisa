import { categorySchema, eventSourceKeySchema, SEVERITIES, SEVERITY_LABELS } from '@sonrisa/shared';
import { useId } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageWidth } from '@/components/AppShell';
import { NativeSelect } from '@/components/NativeSelect';
import { PageHeader } from '@/components/PageHeader';
import { SeverityBadge } from '@/components/Severity';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  EVENT_FILTER_KEYS,
  type EventFilterKey,
  filtersFrom,
  isRangeInverted,
} from '@/lib/event-filters';
import { CATEGORY_LABELS, formatDateTime, SOURCE_LABELS } from '@/lib/labels';
import { useAdminEvents } from '@/lib/queries';

export function EventsPage() {
  const id = useId();
  const [params, setParams] = useSearchParams();
  const filters = filtersFrom(params);
  const events = useAdminEvents(filters);
  const filtered = EVENT_FILTER_KEYS.some((key) => params.get(key));

  const setFilter = (key: EventFilterKey, value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <PageWidth wide>
      <PageHeader
        title="Event explorer"
        description="Every stored Event from every source, newest first, including old ones that were too stale to notify. Open one to see its Severity history and who was notified."
      />
      <form
        aria-label="Filter Events"
        className="mb-8 grid gap-4 bg-mist p-4 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-source`}>Source</Label>
          <NativeSelect
            id={`${id}-source`}
            value={params.get('source') ?? ''}
            onChange={(event) => {
              setFilter('source', event.target.value);
            }}
          >
            <option value="">All sources</option>
            {eventSourceKeySchema.options.map((key) => (
              <option key={key} value={key}>
                {SOURCE_LABELS[key]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-category`}>Category</Label>
          <NativeSelect
            id={`${id}-category`}
            value={params.get('category') ?? ''}
            onChange={(event) => {
              setFilter('category', event.target.value);
            }}
          >
            <option value="">All Categories</option>
            {categorySchema.options.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-severity`}>Minimum Severity</Label>
          <NativeSelect
            id={`${id}-severity`}
            value={params.get('minSeverity') ?? ''}
            onChange={(event) => {
              setFilter('minSeverity', event.target.value);
            }}
          >
            <option value="">Any Severity</option>
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity} · {SEVERITY_LABELS[severity]} or higher
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-from`}>Occurred from</Label>
          <Input
            id={`${id}-from`}
            type="datetime-local"
            value={params.get('from') ?? ''}
            onChange={(event) => {
              setFilter('from', event.target.value);
            }}
            className="h-10 bg-white"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-to`}>Occurred until</Label>
          <Input
            id={`${id}-to`}
            type="datetime-local"
            value={params.get('to') ?? ''}
            onChange={(event) => {
              setFilter('to', event.target.value);
            }}
            className="h-10 bg-white"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={!filtered}
          onClick={() => {
            setParams({}, { replace: true });
          }}
        >
          Clear filters
        </Button>
      </form>

      {isRangeInverted(params) && (
        <p role="status" className="mb-6 border-l-4 border-sev-3 bg-white px-4 py-3 text-sm">
          “Occurred from” is after “Occurred until”, so the time filter is ignored.
        </p>
      )}
      {events.isPending ? (
        <Loading label="Loading Events…" />
      ) : events.isError ? (
        <ErrorState
          title="Events didn't load"
          error={events.error}
          onRetry={() => void events.refetch()}
        />
      ) : events.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No Events match these filters' : 'No Events yet'}
          action={
            filtered ? undefined : (
              <Button asChild>
                <Link to="/admin/simulator">Create one in the Simulator</Link>
              </Button>
            )
          }
        >
          {filtered
            ? 'Try a wider time range, a lower Severity or another source.'
            : 'The pollers store Events as the feeds publish them, and the Simulator can create one now.'}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
            Showing the newest {events.data.length} {events.data.length === 1 ? 'Event' : 'Events'}.
          </p>
          <ul className="grid gap-2" aria-label="Events">
            {events.data.map((event) => (
              <li
                key={event.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border border-border bg-white p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:p-4"
              >
                <SeverityBadge severity={event.severity} />
                <div className="grid min-w-0 gap-0.5">
                  <Link
                    to={`/admin/events/${encodeURIComponent(event.id)}`}
                    className="font-bold break-words hover:underline"
                  >
                    {event.title}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {SOURCE_LABELS[event.source]} · {CATEGORY_LABELS[event.category]}
                    {event.location && <> · {event.location}</>}
                  </span>
                </div>
                <time
                  dateTime={event.occurredAt.toISOString()}
                  className="col-start-2 text-sm sm:col-start-auto"
                >
                  {formatDateTime(event.occurredAt)}
                </time>
                <span className="col-start-2 text-sm whitespace-nowrap sm:col-start-auto">
                  {event.notificationCount}{' '}
                  {event.notificationCount === 1 ? 'Notification' : 'Notifications'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </PageWidth>
  );
}

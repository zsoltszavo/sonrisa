import { SEVERITY_LABELS } from '@sonrisa/shared';
import { ArrowLeft, ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { AdminNotificationList } from '@/components/AdminNotificationList';
import { PageWidth } from '@/components/AppShell';
import { SeverityBadge } from '@/components/Severity';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { CATEGORY_LABELS, formatDateTime, SOURCE_LABELS } from '@/lib/labels';
import { useAdminEvent } from '@/lib/queries';

/** One Event: what it says, how its Severity changed (D20(c)) and every Notification it caused. */
export function EventDetailPage() {
  const { eventId } = useParams();
  const event = useAdminEvent(eventId);
  return (
    <PageWidth wide>
      <Link
        to="/admin/events"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-forest hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to the Event explorer
      </Link>
      {event.isPending ? (
        <Loading label="Loading the Event…" />
      ) : event.isError ? (
        event.error instanceof ApiError && event.error.status === 404 ? (
          <EmptyState title="Event not found">
            There is no Event with this id. It may have been mistyped.
          </EmptyState>
        ) : (
          <ErrorState
            title="This Event didn't load"
            error={event.error}
            onRetry={() => void event.refetch()}
          />
        )
      ) : (
        <article className="grid gap-10">
          <header className="grid gap-5 border-b border-border pb-8 md:grid-cols-[auto_minmax(0,1fr)] md:gap-8">
            <SeverityBadge severity={event.data.severity} showLabel className="self-start" />
            <div className="grid gap-3">
              <h1 className="text-[30px] break-words sm:text-[38px]">{event.data.title}</h1>
              {event.data.summary && <p className="max-w-[65ch]">{event.data.summary}</p>}
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
                <dt className="text-muted-foreground">Source</dt>
                <dd>
                  {SOURCE_LABELS[event.data.source]}{' '}
                  <span className="text-muted-foreground">({event.data.externalId})</span>
                </dd>
                <dt className="text-muted-foreground">Category</dt>
                <dd>{CATEGORY_LABELS[event.data.category]}</dd>
                {event.data.location && (
                  <>
                    <dt className="text-muted-foreground">Location</dt>
                    <dd>{event.data.location}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Occurred</dt>
                <dd>{formatDateTime(event.data.occurredAt)}</dd>
                <dt className="text-muted-foreground">Stored</dt>
                <dd>
                  {formatDateTime(event.data.createdAt)}, last changed{' '}
                  {formatDateTime(event.data.updatedAt)}
                </dd>
              </dl>
              <div className="flex flex-wrap gap-3">
                {event.data.url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={event.data.url} target="_blank" rel="noreferrer">
                      Open at the source
                      <ArrowUpRight aria-hidden="true" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </Button>
                )}
                {event.data.source === 'simulated' && (
                  <Button variant="secondary" size="sm" asChild>
                    <Link to={`/admin/simulator?event=${encodeURIComponent(event.data.id)}`}>
                      Change it in the Simulator
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </header>

          <section aria-labelledby="history" className="grid gap-4">
            <h2 id="history" className="text-2xl">
              Severity history
            </h2>
            <ol className="grid gap-2" aria-label="Severity history">
              {event.data.revisions.map((revision) => {
                const up =
                  revision.previousSeverity !== null &&
                  revision.severity > revision.previousSeverity;
                return (
                  <li
                    key={revision.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 border-l-4 border-mint bg-white px-4 py-3"
                  >
                    <SeverityBadge severity={revision.severity} />
                    <p className="text-sm">
                      {revision.previousSeverity === null ? (
                        <>First stored as {SEVERITY_LABELS[revision.severity]}</>
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {up ? (
                            <TrendingUp className="size-4 text-sev-4" aria-hidden="true" />
                          ) : (
                            <TrendingDown className="size-4" aria-hidden="true" />
                          )}
                          {up ? 'Raised' : 'Lowered'} from {revision.previousSeverity} to{' '}
                          {revision.severity}
                        </span>
                      )}{' '}
                      <span className="text-muted-foreground">
                        ·{' '}
                        <time dateTime={revision.recordedAt.toISOString()}>
                          {formatDateTime(revision.recordedAt)}
                        </time>
                      </span>
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>

          <section aria-labelledby="caused" className="grid gap-4">
            <h2 id="caused" className="text-2xl">
              Notifications it caused ({event.data.notifications.length})
            </h2>
            {event.data.notifications.length === 0 ? (
              <EmptyState title="Nobody was notified">
                No Alert Rule matched, or the Event was older than its source's Freshness Window.
              </EmptyState>
            ) : (
              <AdminNotificationList
                notifications={event.data.notifications}
                label="Notifications about this Event"
                showEvent={false}
              />
            )}
          </section>
        </article>
      )}
    </PageWidth>
  );
}

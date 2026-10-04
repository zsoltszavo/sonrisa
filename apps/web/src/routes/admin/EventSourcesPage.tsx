import {
  type EventSource,
  type EventSourceUpdate,
  MAX_FRESHNESS_HOURS,
  MAX_POLL_INTERVAL_SEC,
  MIN_POLL_INTERVAL_SEC,
  type PollResult,
} from '@sonrisa/shared';
import { CircleAlert, CircleCheck, RefreshCw } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { PageWidth } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, errorMessage } from '@/lib/api';
import { formatAgo, formatDateTime, formatSeconds } from '@/lib/labels';
import { useEventSources, usePollNow, useUpdateEventSource } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function EventSourcesPage() {
  const sources = useEventSources();
  return (
    <PageWidth wide>
      <PageHeader
        title="Event Sources"
        description="Where Events come from. Turn a source off, change how often it is polled and how old an Event may be and still notify, or poll it right now."
      />
      {sources.isPending ? (
        <Loading label="Loading Event Sources…" />
      ) : sources.isError ? (
        <ErrorState
          title="Event Sources didn't load"
          error={sources.error}
          onRetry={() => void sources.refetch()}
        />
      ) : sources.data.length === 0 ? (
        <EmptyState title="No Event Sources">
          The database has no Event Sources. Run <code>pnpm db:seed</code> to create USGS, GDACS and
          the Simulated Source.
        </EmptyState>
      ) : (
        <ul className="grid gap-4" aria-label="Event Sources">
          {sources.data.map((source) => (
            // Keyed on the source only: a remount after Save would drop the last poll summary (CR61).
            <SourceCard key={source.key} source={source} />
          ))}
        </ul>
      )}
    </PageWidth>
  );
}

function SourceCard({ source }: { source: EventSource }) {
  const id = useId();
  const update = useUpdateEventSource();
  const pollNow = usePollNow();
  const [interval, setIntervalSec] = useState(String(source.intervalSec ?? ''));
  const [freshness, setFreshness] = useState(String(source.freshnessHours));
  const [lastPoll, setLastPoll] = useState<PollResult | null>(null);
  const polled = source.intervalSec !== null;

  const fieldError = (field: keyof EventSourceUpdate) =>
    update.error instanceof ApiError
      ? update.error.issues.find((issue) => issue.path[0] === field)?.message
      : undefined;

  // mutateAsync, not mutate's callbacks: those are skipped if this card re-renders away first (CR60).
  const save = (patch: EventSourceUpdate, message: string) => {
    update.mutateAsync({ key: source.key, update: patch }).then(
      () => toast.success(message),
      (error: unknown) => toast.error(errorMessage(error)),
    );
  };

  const changes: EventSourceUpdate = {};
  if (polled && interval !== String(source.intervalSec)) changes.intervalSec = Number(interval);
  if (freshness !== String(source.freshnessHours)) changes.freshnessHours = Number(freshness);
  const dirty = Object.keys(changes).length > 0;

  return (
    <li className="grid gap-6 border border-border bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="text-2xl">{source.name}</h2>
          <p className="text-sm text-muted-foreground">
            {polled
              ? `Polled every ${formatSeconds(source.intervalSec ?? 0)}`
              : 'Never polled: its Events come from the Simulator'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              'px-2 py-1 font-heading text-[12px]',
              source.enabled ? 'bg-mint text-forest' : 'bg-mist text-muted-foreground',
            )}
          >
            {source.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={update.isPending}
            onClick={() => {
              save(
                { enabled: !source.enabled },
                source.enabled ? `${source.name} disabled` : `${source.name} enabled`,
              );
            }}
          >
            {source.enabled ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </div>

      {polled && (
        <div className="grid gap-3 bg-mist p-4" aria-live="polite">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {source.lastError ? (
              <CircleAlert className="size-4 text-destructive" aria-hidden="true" />
            ) : (
              <CircleCheck className="size-4 text-forest" aria-hidden="true" />
            )}
            {source.lastPollAt ? (
              <span>
                Last poll{' '}
                <time
                  dateTime={source.lastPollAt.toISOString()}
                  title={formatDateTime(source.lastPollAt)}
                >
                  {formatAgo(source.lastPollAt)}
                </time>
                {source.lastError ? ' failed' : ' succeeded'}
              </span>
            ) : (
              'Not polled yet'
            )}
          </p>
          {source.lastError && (
            <p className="border-l-2 border-destructive pl-2 text-sm break-words text-destructive">
              {source.lastError}
            </p>
          )}
          {lastPoll && <PollSummary result={lastPoll} />}
          <Button
            variant="secondary"
            size="sm"
            className="justify-self-start bg-white"
            disabled={pollNow.isPending}
            onClick={() => {
              pollNow.mutate(source.key, {
                onSuccess: setLastPoll,
                onError: (error) => toast.error(errorMessage(error)),
              });
            }}
          >
            <RefreshCw className={cn(pollNow.isPending && 'animate-spin')} aria-hidden="true" />
            {pollNow.isPending ? 'Polling…' : 'Poll now'}
          </Button>
        </div>
      )}

      <form
        className={cn(
          'grid gap-4 sm:items-start',
          polled
            ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'
            : 'sm:grid-cols-[minmax(0,1fr)_auto]',
        )}
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty) save(changes, `${source.name} saved`);
        }}
      >
        {polled && (
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-interval`}>Polling interval (seconds)</Label>
            <Input
              id={`${id}-interval`}
              type="number"
              inputMode="numeric"
              min={MIN_POLL_INTERVAL_SEC}
              max={MAX_POLL_INTERVAL_SEC}
              required
              value={interval}
              onChange={(event) => {
                setIntervalSec(event.target.value);
              }}
              aria-invalid={fieldError('intervalSec') ? true : undefined}
              aria-describedby={`${id}-interval-hint`}
              className="h-10"
            />
            <p id={`${id}-interval-hint`} className="text-xs text-muted-foreground">
              {fieldError('intervalSec') ??
                `${formatSeconds(MIN_POLL_INTERVAL_SEC)} to ${formatSeconds(MAX_POLL_INTERVAL_SEC)}`}
            </p>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-freshness`}>Freshness Window (hours)</Label>
          <Input
            id={`${id}-freshness`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_FRESHNESS_HOURS}
            required
            value={freshness}
            onChange={(event) => {
              setFreshness(event.target.value);
            }}
            aria-invalid={fieldError('freshnessHours') ? true : undefined}
            aria-describedby={`${id}-freshness-hint`}
            className="h-10"
          />
          <p id={`${id}-freshness-hint`} className="text-xs text-muted-foreground">
            {fieldError('freshnessHours') ?? 'Older Events are stored and shown, but never notify.'}
          </p>
        </div>
        <Button type="submit" disabled={!dirty || update.isPending} className="sm:mt-[22px]">
          Save changes
        </Button>
      </form>
    </li>
  );
}

function PollSummary({ result }: { result: PollResult }) {
  const counts = [
    ['fetched', result.fetched],
    ['new', result.created],
    ['updated', result.updated],
    ['unchanged', result.unchanged],
    ['ignored', result.ignored],
    ['skipped', result.skipped],
    ['failed', result.failed],
  ] as const;
  return (
    <div className="grid gap-1 text-sm">
      <p className="font-bold">{result.error ? 'Poll finished with an error' : 'Poll finished'}</p>
      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        {counts.map(([label, count]) => (
          <div key={label} className="flex gap-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-heading">{count}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

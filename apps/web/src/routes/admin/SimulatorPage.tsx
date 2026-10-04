import {
  type AdminEvent,
  categorySchema,
  type Category,
  SEVERITIES,
  SEVERITY_LABELS,
  type Severity,
  type SimulatedEventInput,
} from '@sonrisa/shared';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AdminNotificationList } from '@/components/AdminNotificationList';
import { PageWidth } from '@/components/AppShell';
import { NativeSelect } from '@/components/NativeSelect';
import { PageHeader } from '@/components/PageHeader';
import { SeverityBadge } from '@/components/Severity';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, errorMessage } from '@/lib/api';
import { CATEGORY_LABELS, formatAgo, severityText, SEVERITY_TILE } from '@/lib/labels';
import { useAdminEvent, useAdminEvents, useSaveSimulatedEvent } from '@/lib/queries';
import { cn } from '@/lib/utils';

const SIMULATED = { source: 'simulated', limit: 20 } as const;

interface Draft {
  category: Category;
  severity: Severity;
  title: string;
  summary: string;
  location: string;
  url: string;
}

const EMPTY_DRAFT: Draft = {
  category: 'news',
  severity: 3,
  title: '',
  summary: '',
  location: '',
  url: '',
};

const toInput = (draft: Draft): SimulatedEventInput => ({
  category: draft.category,
  severity: draft.severity,
  title: draft.title.trim(),
  summary: draft.summary.trim(),
  location: draft.location.trim(),
  url: draft.url.trim() === '' ? null : draft.url.trim(),
});

/**
 * The Simulated Source console (D10): create an Event on purpose, then raise its Severity and watch
 * the Escalation go out. The selected Event lives in `?event=` so a reload keeps it.
 */
export function SimulatorPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('event') ?? undefined;
  const select = (id: string) => {
    setParams({ event: id }, { replace: true });
  };
  return (
    <PageWidth wide>
      <PageHeader
        title="Simulator"
        description="Create Events from the Simulated Source for demos and Categories with no real feed. Raise an Event's Severity to send an Escalation to everyone already notified about it."
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <CreateEventForm onCreated={select} />
        <div className="grid content-start gap-10">
          {selectedId && <SelectedEvent id={selectedId} />}
          <RecentSimulatedEvents selectedId={selectedId} onSelect={select} />
        </div>
      </div>
    </PageWidth>
  );
}

function CreateEventForm({ onCreated }: { onCreated: (id: string) => void }) {
  const id = useId();
  const save = useSaveSimulatedEvent();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const issues = save.error instanceof ApiError ? save.error.issues : [];
  const issueFor = (field: keyof Draft) => issues.find((issue) => issue.path[0] === field)?.message;
  const otherIssues = issues.filter(
    (issue) => !Object.keys(EMPTY_DRAFT).includes(String(issue.path[0])),
  );

  const field = (key: 'title' | 'location' | 'url', label: string, hint?: string) => {
    const error = issueFor(key);
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-${key}`}>{label}</Label>
        <Input
          id={`${id}-${key}`}
          value={draft[key]}
          required={key === 'title'}
          type={key === 'url' ? 'url' : 'text'}
          onChange={(event) => {
            set(key, event.target.value);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-${key}-hint` : undefined}
          className="h-10"
        />
        {(error ?? hint) && (
          <p
            id={`${id}-${key}-hint`}
            className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    );
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="grid content-start gap-5">
      <h2 id={`${id}-heading`} className="text-2xl">
        New simulated Event
      </h2>
      <form
        className="grid gap-4 border border-border bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(
            { input: toInput(draft) },
            {
              onSuccess: (created) => {
                toast.success('Event created');
                setDraft((current) => ({ ...EMPTY_DRAFT, category: current.category }));
                onCreated(created.id);
              },
              onError: (error) => {
                if (!(error instanceof ApiError && error.issues.length > 0)) {
                  toast.error(errorMessage(error));
                }
              },
            },
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-category`}>Category</Label>
            <NativeSelect
              id={`${id}-category`}
              value={draft.category}
              onChange={(event) => {
                set('category', categorySchema.parse(event.target.value));
              }}
            >
              {categorySchema.options.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-severity`}>Severity</Label>
            <SeveritySelect
              id={`${id}-severity`}
              value={draft.severity}
              onChange={(severity) => {
                set('severity', severity);
              }}
            />
          </div>
        </div>
        {field('title', 'Title')}
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-summary`}>Summary</Label>
          <Textarea
            id={`${id}-summary`}
            rows={3}
            value={draft.summary}
            onChange={(event) => {
              set('summary', event.target.value);
            }}
          />
        </div>
        {field('location', 'Location', 'A place name, e.g. "Vienna, Austria". Keywords match it.')}
        {field('url', 'Link (optional)', 'http or https only.')}
        {otherIssues.length > 0 && (
          <p role="alert" className="text-sm text-destructive">
            {otherIssues.map((issue) => issue.message).join(' ')}
          </p>
        )}
        <Button type="submit" disabled={save.isPending} className="justify-self-start">
          {save.isPending ? 'Creating…' : 'Create Event'}
        </Button>
      </form>
    </section>
  );
}

function SeveritySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: Severity;
  onChange: (severity: Severity) => void;
}) {
  return (
    <NativeSelect
      id={id}
      value={value}
      onChange={(event) => {
        const severity = SEVERITIES.find((s) => String(s) === event.target.value);
        if (severity) onChange(severity);
      }}
    >
      {SEVERITIES.map((severity) => (
        <option key={severity} value={severity}>
          {severityText(severity)}
        </option>
      ))}
    </NativeSelect>
  );
}

function RecentSimulatedEvents({
  selectedId,
  onSelect,
}: {
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const events = useAdminEvents(SIMULATED, { live: true });
  return (
    <section aria-labelledby="recent-simulated" className="grid content-start gap-4">
      <h2 id="recent-simulated" className="text-2xl">
        Recent simulated Events
      </h2>
      {events.isPending ? (
        <Loading label="Loading simulated Events…" />
      ) : events.isError ? (
        <ErrorState
          title="Simulated Events didn't load"
          error={events.error}
          onRetry={() => void events.refetch()}
        />
      ) : events.data.length === 0 ? (
        <EmptyState title="Nothing simulated yet">
          Create an Event with the form. It goes through the same matching and delivery as a real
          one.
        </EmptyState>
      ) : (
        <ul className="grid gap-2" aria-label="Recent simulated Events">
          {events.data.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                aria-current={event.id === selectedId ? 'true' : undefined}
                onClick={() => {
                  onSelect(event.id);
                }}
                className={cn(
                  'grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border bg-white p-3 text-left hover:border-forest sm:grid-cols-[auto_minmax(0,1fr)_auto]',
                  event.id === selectedId
                    ? 'border-forest outline-2 outline-forest'
                    : 'border-border',
                )}
              >
                <SeverityBadge severity={event.severity} />
                <span className="grid min-w-0">
                  <span className="font-bold break-words sm:truncate">{event.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {CATEGORY_LABELS[event.category]} · {formatAgo(event.createdAt)}
                  </span>
                </span>
                <span className="col-start-2 text-sm whitespace-nowrap sm:col-start-auto">
                  {event.notificationCount}{' '}
                  {event.notificationCount === 1 ? 'Notification' : 'Notifications'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The chosen Event: change its Severity, then watch its history and Notifications update live. */
function SelectedEvent({ id }: { id: string }) {
  const event = useAdminEvent(id, { live: true });
  return (
    <section
      aria-labelledby="selected-event"
      className="grid content-start gap-5 border-2 border-forest bg-mist p-5"
    >
      {event.isPending ? (
        <Loading label="Loading the Event…" />
      ) : event.isError && event.error instanceof ApiError && event.error.status === 404 ? (
        <EmptyState title="Event not found">
          The selected Event doesn't exist. Pick one from the list below or create a new one.
        </EmptyState>
      ) : event.isError ? (
        <ErrorState
          title="This Event didn't load"
          error={event.error}
          onRetry={() => void event.refetch()}
        />
      ) : event.data.source !== 'simulated' ? (
        <EmptyState title="Not a simulated Event">
          Only Events of the Simulated Source can be changed here.{' '}
          <Link to={`/admin/events/${encodeURIComponent(id)}`} className="underline">
            Open it in the Event explorer
          </Link>
          .
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-1">
            <p className="font-heading text-[13px] text-muted-foreground">Selected Event</p>
            <h2 id="selected-event" className="text-2xl break-words">
              {event.data.title}
            </h2>
            <p className="text-sm">
              {CATEGORY_LABELS[event.data.category]}
              {event.data.location && <> in {event.data.location}</>} ·{' '}
              <Link to={`/admin/events/${encodeURIComponent(id)}`} className="underline">
                Details in the Event explorer
              </Link>
            </p>
          </div>
          {/* Keyed on the stored Severity so the picker follows the server after a change. */}
          <SeverityChanger key={event.data.severity} event={event.data} />
          <div className="grid gap-2">
            <h3 className="font-heading text-[15px]">Severity history</h3>
            <ol className="flex flex-wrap items-center gap-2" aria-label="Severity history">
              {event.data.revisions.map((revision, index) => (
                <li key={revision.id} className="flex items-center gap-2">
                  {index > 0 && <ArrowRight className="size-4" aria-hidden="true" />}
                  <SeverityBadge severity={revision.severity} />
                </li>
              ))}
            </ol>
          </div>
          <div className="grid gap-2" aria-live="polite">
            <h3 className="font-heading text-[15px]">
              Notifications ({event.data.notificationCount})
            </h3>
            {event.data.notifications.length === 0 ? (
              <p className="text-sm">
                Nobody was notified. Either no Alert Rule matched (a{' '}
                {CATEGORY_LABELS[event.data.category]} rule with a minimum Severity of{' '}
                {event.data.severity} or less, and a matching Keyword if it has any, would), or the
                Event is older than the Simulated Source's Freshness Window. Raising its Severity
                notifies either way.
              </p>
            ) : (
              <AdminNotificationList
                notifications={event.data.notifications}
                label="Notifications about the selected Event"
                showEvent={false}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function SeverityChanger({ event }: { event: AdminEvent }) {
  const save = useSaveSimulatedEvent();
  const [severity, setSeverity] = useState<Severity>(event.severity);
  const direction = severity > event.severity ? 'up' : severity < event.severity ? 'down' : null;
  return (
    <form
      className="grid gap-3"
      onSubmit={(submit) => {
        submit.preventDefault();
        // Keyed on the Severity, this form remounts once the refetch lands; mutateAsync still resolves (CR60).
        save
          .mutateAsync({
            id: event.id,
            input: {
              category: event.category,
              severity,
              title: event.title,
              summary: event.summary,
              location: event.location,
              url: event.url,
            },
          })
          .then(
            () => toast.success(`Severity changed to ${severityText(severity)}`),
            (error: unknown) => toast.error(errorMessage(error)),
          );
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-heading text-[15px]">Change Severity</legend>
        <div className="flex flex-wrap gap-1.5">
          {SEVERITIES.map((value) => (
            <label key={value} className="relative cursor-pointer">
              <input
                type="radio"
                name="severity"
                value={value}
                checked={severity === value}
                onChange={() => {
                  setSeverity(value);
                }}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-10 min-w-10 items-center justify-center px-3 font-heading text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-forest',
                  SEVERITY_TILE[value],
                  severity === value ? 'ring-3 ring-forest' : 'opacity-70 hover:opacity-100',
                )}
              >
                {value}
                <span className="sr-only">, {SEVERITY_LABELS[value]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="flex items-center gap-2 text-sm" aria-live="polite">
        {direction === 'up' && (
          <>
            <TrendingUp className="size-4 text-sev-4" aria-hidden="true" />
            Raising it sends an Escalation to recipients already notified at a lower Severity.
          </>
        )}
        {direction === 'down' && (
          <>
            <TrendingDown className="size-4" aria-hidden="true" />A downgrade is stored but never
            notifies.
          </>
        )}
        {direction === null && <>Now {severityText(event.severity)}.</>}
      </p>
      <Button
        type="submit"
        disabled={direction === null || save.isPending}
        className="justify-self-start"
      >
        {save.isPending ? 'Saving…' : 'Update Severity'}
      </Button>
    </form>
  );
}

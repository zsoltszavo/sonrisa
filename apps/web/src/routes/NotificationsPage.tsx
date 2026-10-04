import { SEVERITY_LABELS, type MyNotification } from '@sonrisa/shared';
import { ArrowUpRight, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { PageWidth } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { SeverityBadge } from '@/components/Severity';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { Button } from '@/components/ui/button';
import { CATEGORY_LABELS, formatAgo, formatDateTime } from '@/lib/labels';
import { useMyNotifications } from '@/lib/queries';
import { cn } from '@/lib/utils';

const STATUS_TEXT: Record<MyNotification['status'], string> = {
  pending: 'Sending',
  sent: 'Delivered',
  failed: 'Not delivered',
};

export function NotificationsPage() {
  const notifications = useMyNotifications();
  return (
    <PageWidth>
      <PageHeader
        title="My notifications"
        description="Every alert sent to you, newest first. An Escalation follows up when an Event you were told about becomes more severe."
      />
      {notifications.isPending ? (
        <Loading label="Loading your notifications…" />
      ) : notifications.isError ? (
        <ErrorState
          title="Your notifications didn't load"
          error={notifications.error}
          onRetry={() => void notifications.refetch()}
        />
      ) : notifications.data.length === 0 ? (
        <EmptyState
          title="No alerts yet"
          action={
            <Button asChild>
              <Link to="/rules">Review my alert rules</Link>
            </Button>
          }
        >
          When a new Event matches one of your alert rules, the alert shows up here as well as on
          its destination.
        </EmptyState>
      ) : (
        <ol className="grid gap-3" aria-label="Notifications">
          {notifications.data.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
          ))}
        </ol>
      )}
    </PageWidth>
  );
}

function NotificationItem({ notification }: { notification: MyNotification }) {
  const { event, destination } = notification;
  const escalated = notification.kind === 'escalation';
  return (
    <li
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border border-border bg-white p-4 sm:p-5',
        escalated && 'border-l-[6px] border-l-sev-4',
      )}
    >
      <SeverityBadge severity={notification.severity} className="self-start" />
      <div className="grid gap-2">
        {escalated && (
          <p className="inline-flex items-center gap-1.5 font-heading text-[13px] text-forest">
            <TrendingUp className="size-4 text-sev-4" aria-hidden="true" />
            Escalated to {notification.severity} · {SEVERITY_LABELS[notification.severity]}
          </p>
        )}
        <h2 className="font-sans text-[17px] leading-snug font-bold text-foreground">
          {event.url ? (
            <a href={event.url} target="_blank" rel="noreferrer" className="hover:underline">
              {event.title}
              <ArrowUpRight className="ml-1 inline size-4" aria-hidden="true" />
              <span className="sr-only"> (opens the source in a new tab)</span>
            </a>
          ) : (
            event.title
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          {CATEGORY_LABELS[event.category]}
          {event.location && <> in {event.location}</>}, occurred {formatDateTime(event.occurredAt)}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            {STATUS_TEXT[notification.status]} to{' '}
            {destination ? destination.label : <em>a deleted destination</em>}
          </span>
          <time dateTime={notification.createdAt.toISOString()} className="text-muted-foreground">
            {formatAgo(notification.createdAt)}
          </time>
        </p>
      </div>
    </li>
  );
}

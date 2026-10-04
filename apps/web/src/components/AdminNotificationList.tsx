import { type AdminNotification, MAX_DELIVERY_ATTEMPTS } from '@sonrisa/shared';
import { RotateCcw, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { CATEGORY_LABELS, formatAgo, SOURCE_LABELS, STATUS_LABELS } from '@/lib/labels';
import { useRetryNotification } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { SeverityBadge } from './Severity';
import { Button } from './ui/button';

const STATUS_STYLE: Record<AdminNotification['status'], string> = {
  pending: 'bg-mist text-forest',
  sent: 'bg-mint text-forest',
  failed: 'bg-destructive text-white',
};

/**
 * Notifications as the admin sees them: who got what, where, and how delivery went, with a retry
 * for failed ones. `showEvent` is off on an Event's own page, where the Event is already the title.
 */
export function AdminNotificationList({
  notifications,
  label,
  showEvent = true,
}: {
  notifications: AdminNotification[];
  label: string;
  showEvent?: boolean;
}) {
  return (
    <ol className="grid gap-2" aria-label={label}>
      {notifications.map((notification) => (
        <AdminNotificationItem
          key={notification.id}
          notification={notification}
          showEvent={showEvent}
        />
      ))}
    </ol>
  );
}

function AdminNotificationItem({
  notification,
  showEvent,
}: {
  notification: AdminNotification;
  showEvent: boolean;
}) {
  const retry = useRetryNotification();
  const { event, destination, user } = notification;
  const escalated = notification.kind === 'escalation';
  return (
    <li
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border border-border bg-white p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]',
        escalated && 'border-l-[6px] border-l-sev-4',
      )}
    >
      <SeverityBadge severity={notification.severity} className="self-start" />
      <div className="grid min-w-0 gap-1.5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span
            className={cn(
              'px-2 py-0.5 font-heading text-[12px]',
              STATUS_STYLE[notification.status],
            )}
          >
            {STATUS_LABELS[notification.status]}
          </span>
          {escalated ? (
            <span className="inline-flex items-center gap-1 font-heading text-[12px] text-forest">
              <TrendingUp className="size-4 text-sev-4" aria-hidden="true" />
              Escalation
            </span>
          ) : (
            <span className="font-heading text-[12px] text-muted-foreground">Match</span>
          )}
          <span className="text-muted-foreground">
            {notification.attempts === 0
              ? 'Not attempted yet'
              : `Attempt ${String(notification.attempts)} of ${String(MAX_DELIVERY_ATTEMPTS)}`}
          </span>
        </p>
        {showEvent && (
          <p className="font-bold">
            <Link to={`/admin/events/${encodeURIComponent(event.id)}`} className="hover:underline">
              {event.title}
            </Link>{' '}
            <span className="font-normal text-muted-foreground">
              · {SOURCE_LABELS[event.source]} · {CATEGORY_LABELS[event.category]}
            </span>
          </p>
        )}
        <p className="text-sm break-words">
          To {user.email} via{' '}
          {destination ? (
            <>
              {destination.label}{' '}
              <span className="text-muted-foreground">({destination.channel})</span>
            </>
          ) : (
            <em>a deleted destination</em>
          )}
          <span className="text-muted-foreground">
            {' '}
            · created{' '}
            <time dateTime={notification.createdAt.toISOString()}>
              {formatAgo(notification.createdAt)}
            </time>
          </span>
        </p>
        {notification.lastError && (
          <p className="border-l-2 border-destructive pl-2 text-sm break-words text-destructive">
            {/* Retry keeps the old error until a send succeeds (D21(e)); say so while it is retried (CR66). */}
            {notification.status === 'failed' ? (
              <span className="sr-only">Last error: </span>
            ) : (
              <span className="font-bold">Previous error: </span>
            )}
            {notification.lastError}
          </p>
        )}
      </div>
      {notification.status === 'failed' && (
        <Button
          variant="outline"
          size="sm"
          className="col-start-2 justify-self-start sm:col-start-3 sm:self-start"
          disabled={retry.isPending}
          aria-label={`Retry the Notification to ${user.email} about ${event.title}`}
          onClick={() => {
            // With the "Failed" filter on, the refetch removes this row before mutate's own
            // callbacks would run; mutateAsync still resolves (CR62).
            retry.mutateAsync(notification.id).then(
              () => toast.success('Queued for delivery again'),
              (error: unknown) => toast.error(errorMessage(error)),
            );
          }}
        >
          <RotateCcw aria-hidden="true" />
          Retry
        </Button>
      )}
    </li>
  );
}

import {
  MAX_DELIVERY_ATTEMPTS,
  type NotificationStatus,
  notificationStatusSchema,
} from '@sonrisa/shared';
import { Link, useSearchParams } from 'react-router';
import { AdminNotificationList } from '@/components/AdminNotificationList';
import { PageWidth } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { STATUS_LABELS } from '@/lib/labels';
import { useAdminNotifications } from '@/lib/queries';
import { cn } from '@/lib/utils';

const FILTERS: { status: NotificationStatus | undefined; label: string }[] = [
  { status: undefined, label: 'All' },
  ...notificationStatusSchema.options.map((status) => ({ status, label: STATUS_LABELS[status] })),
];

const EMPTY_TEXT: Record<NotificationStatus | 'all', string> = {
  all: 'No Notification has been created yet. They appear when an Event matches an Alert Rule.',
  pending: 'Nothing is waiting to be delivered.',
  sent: 'No Notification has been delivered yet.',
  failed: 'No delivery has failed. Nothing to retry.',
};

/** The Notification log (D10): every delivery, its attempts and last error, with retry for failed ones. */
export function NotificationLogPage() {
  const [params] = useSearchParams();
  const parsed = notificationStatusSchema.safeParse(params.get('status'));
  const status = parsed.success ? parsed.data : undefined;
  const notifications = useAdminNotifications(status);
  return (
    <PageWidth wide>
      <PageHeader
        title="Notification log"
        description={`Every Notification, newest first: who it went to, on which destination, and how delivery went. A failed one can be retried; it gets ${String(MAX_DELIVERY_ATTEMPTS)} fresh attempts.`}
      />
      <nav aria-label="Filter by status" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = filter.status === status;
            return (
              <li key={filter.label}>
                <Link
                  to={filter.status ? `?status=${filter.status}` : '?'}
                  replace
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block rounded-full border px-4 py-1.5 text-sm',
                    active
                      ? 'border-forest bg-forest text-white'
                      : 'border-mint bg-white text-forest hover:bg-mint',
                  )}
                >
                  {filter.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {notifications.isPending ? (
        <Loading label="Loading Notifications…" />
      ) : notifications.isError ? (
        <ErrorState
          title="The Notification log didn't load"
          error={notifications.error}
          onRetry={() => void notifications.refetch()}
        />
      ) : notifications.data.length === 0 ? (
        <EmptyState title={status ? `No ${status} Notifications` : 'No Notifications yet'}>
          {EMPTY_TEXT[status ?? 'all']}
        </EmptyState>
      ) : (
        <AdminNotificationList notifications={notifications.data} label="Notifications" />
      )}
    </PageWidth>
  );
}

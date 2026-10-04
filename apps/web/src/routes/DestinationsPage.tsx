import type { ChannelDestinationBase } from '@sonrisa/shared';
import { Mail, MessageSquare, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageWidth } from '@/components/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DestinationDialog } from '@/components/DestinationDialog';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api';
import { describeConfig } from '@/lib/labels';
import {
  useChannelName,
  useChannels,
  useDeleteDestination,
  useDestinations,
  useTestDestination,
} from '@/lib/queries';

const ICONS: Record<string, typeof Mail> = { email: Mail, slack: MessageSquare };

export function DestinationsPage() {
  const destinations = useDestinations();
  const channels = useChannels();
  const [editing, setEditing] = useState<ChannelDestinationBase | 'new' | null>(null);

  const add = (
    <Button
      size="lg"
      disabled={!channels.data}
      onClick={() => {
        setEditing('new');
      }}
    >
      <Plus aria-hidden="true" />
      Add destination
    </Button>
  );

  return (
    <PageWidth>
      <PageHeader
        title="Destinations"
        description="The places your alerts are delivered to: an email address or a Slack channel. Send a test to check one works before a rule uses it."
        action={destinations.data && destinations.data.length > 0 ? add : undefined}
      />
      {destinations.isPending || channels.isPending ? (
        <Loading label="Loading your destinations…" />
      ) : destinations.isError || channels.isError ? (
        <ErrorState
          title="Your destinations didn't load"
          error={destinations.error ?? channels.error}
          onRetry={() => {
            void destinations.refetch();
            void channels.refetch();
          }}
        />
      ) : destinations.data.length === 0 ? (
        <EmptyState title="No destinations yet" action={add}>
          Add your email address or a Slack channel so your alert rules have somewhere to send
          alerts.
        </EmptyState>
      ) : (
        <ul className="grid gap-3" aria-label="Destinations">
          {destinations.data.map((destination) => (
            <DestinationItem
              key={destination.id}
              destination={destination}
              onEdit={() => {
                setEditing(destination);
              }}
            />
          ))}
        </ul>
      )}
      {channels.data && (
        <DestinationDialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          channels={channels.data}
          destination={editing === 'new' || editing === null ? undefined : editing}
        />
      )}
    </PageWidth>
  );
}

function DestinationItem({
  destination,
  onEdit,
}: {
  destination: ChannelDestinationBase;
  onEdit: () => void;
}) {
  const test = useTestDestination();
  const remove = useDeleteDestination();
  const channelName = useChannelName();
  const Icon = ICONS[destination.channel] ?? Send;

  return (
    <li className="grid gap-4 border border-border bg-white p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5">
      <span
        className="inline-flex size-9 items-center justify-center bg-mist text-forest"
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      <div className="grid min-w-0 gap-1">
        <h2 className="text-lg break-words">{destination.label}</h2>
        <p className="text-sm break-all text-muted-foreground">
          {channelName(destination.channel)} ·{' '}
          {describeConfig(destination.channel, destination.config)}
        </p>
        <p role="status" className="text-sm">
          {test.isPending && 'Sending a test message…'}
          {test.isError && (
            <span className="text-destructive">
              The test couldn't be sent. {errorMessage(test.error)}
            </span>
          )}
          {test.data?.delivered === true && 'Test message sent. Check that it arrived.'}
          {test.data?.delivered === false && (
            <span className="text-destructive">Not delivered: {test.data.error}</span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={test.isPending}
          onClick={() => {
            test.mutate(destination.id);
          }}
          aria-label={`Send a test to ${destination.label}`}
        >
          <Send aria-hidden="true" />
          Send test
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${destination.label}`}>
          <Pencil aria-hidden="true" />
          Edit
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" aria-label={`Delete ${destination.label}`}>
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          }
          title="Delete this destination?"
          description={`Alerts will no longer go to ${destination.label}. Alerts already sent stay in My notifications.`}
          confirmLabel="Delete destination"
          onConfirm={async () => {
            try {
              await remove.mutateAsync(destination.id);
              toast.success('Destination deleted');
            } catch (error) {
              // 409: rules still use it (D19b). Say what to do instead of a raw status.
              toast.error(
                error instanceof ApiError && error.status === 409
                  ? 'An alert rule still sends to this destination. Remove it from those rules first.'
                  : `The destination wasn't deleted. ${errorMessage(error)}`,
              );
              throw error;
            }
          }}
        />
      </div>
    </li>
  );
}

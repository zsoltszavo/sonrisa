import {
  type AlertRule,
  type ChannelDestinationBase,
  SEVERITY_LABELS,
  severityHint,
} from '@sonrisa/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { PageWidth } from '@/components/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { SeverityBadge } from '@/components/Severity';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CATEGORY_LABELS } from '@/lib/labels';
import { useDeleteRule, useDestinations, useRules } from '@/lib/queries';

export function RulesPage() {
  const rules = useRules();
  const destinations = useDestinations();
  const newRule = (
    <Button asChild size="lg">
      <Link to="/rules/new">
        <Plus aria-hidden="true" />
        New alert rule
      </Link>
    </Button>
  );

  return (
    <PageWidth>
      <PageHeader
        title="Alert rules"
        description="Each rule says which Events are important to you: a Category, a minimum Severity and, if you like, keywords. A matching Event is sent to the rule's destinations."
        action={rules.data && rules.data.length > 0 ? newRule : undefined}
      />
      {rules.isPending || destinations.isPending ? (
        <Loading label="Loading your alert rules…" />
      ) : rules.isError || destinations.isError ? (
        <ErrorState
          title="Your alert rules didn't load"
          error={rules.error ?? destinations.error}
          onRetry={() => {
            void rules.refetch();
            void destinations.refetch();
          }}
        />
      ) : rules.data.length === 0 ? (
        <EmptyState title="No alert rules yet" action={newRule}>
          Create a rule to start getting alerts, for example every earthquake of magnitude 6 or
          more, or disaster news that mentions a country you care about.
        </EmptyState>
      ) : (
        <ul className="grid gap-3" aria-label="Alert rules">
          {rules.data.map((rule) => (
            <RuleItem key={rule.id} rule={rule} destinations={destinations.data} />
          ))}
        </ul>
      )}
    </PageWidth>
  );
}

function RuleItem({
  rule,
  destinations,
}: {
  rule: AlertRule;
  destinations: ChannelDestinationBase[];
}) {
  const remove = useDeleteRule();
  const hint = severityHint(rule.category, rule.minSeverity);
  const name = `${CATEGORY_LABELS[rule.category]}, ${SEVERITY_LABELS[rule.minSeverity].toLowerCase()} or worse`;
  const targets = rule.destinationIds.map(
    (id) =>
      destinations.find((destination) => destination.id === id)?.label ?? 'Unknown destination',
  );

  return (
    <li className="grid gap-4 border border-border bg-white p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5">
      <SeverityBadge severity={rule.minSeverity} className="self-start" />
      <div className="grid gap-2">
        <h2 className="text-lg">{name}</h2>
        <p className="text-sm text-muted-foreground">
          Severity {rule.minSeverity} or higher{hint && <> ({hint})</>}
        </p>
        <p className="text-sm">
          {rule.keywords.length === 0 ? (
            'Any keywords'
          ) : (
            <>
              <span className="sr-only">Keywords: </span>
              {rule.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="mr-1.5 mb-1 inline-block rounded-full bg-mist px-2.5 py-0.5"
                >
                  {keyword}
                </span>
              ))}
            </>
          )}
        </p>
        <p className="text-sm">Sends to {targets.join(', ')}</p>
      </div>
      <div className="flex items-start gap-1">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/rules/${rule.id}`} aria-label={`Edit rule: ${name}`}>
            <Pencil aria-hidden="true" />
            Edit
          </Link>
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" aria-label={`Delete rule: ${name}`}>
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          }
          title="Delete this alert rule?"
          description={`You'll stop getting alerts for ${name.toLowerCase()}. Alerts you already received stay in My notifications.`}
          confirmLabel="Delete rule"
          onConfirm={async () => {
            try {
              await remove.mutateAsync(rule.id);
              toast.success('Rule deleted');
            } catch (error) {
              toast.error(`The rule wasn't deleted. ${errorMessage(error)}`);
              throw error;
            }
          }}
        />
      </div>
    </li>
  );
}

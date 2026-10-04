import { zodResolver } from '@hookform/resolvers/zod';
import {
  type AlertRule,
  type AlertRuleInput,
  alertRuleInputSchema,
  categorySchema,
  type ChannelDestinationBase,
  KEYWORD_SUGGESTIONS,
} from '@sonrisa/shared';
import { ArrowLeft } from 'lucide-react';
import { useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageWidth } from '@/components/AppShell';
import { KeywordInput } from '@/components/KeywordInput';
import { RulePreview, RulePreviewSummary } from '@/components/RulePreview';
import { SeverityScale } from '@/components/SeverityScale';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api';
import { CATEGORY_LABELS, describeConfig } from '@/lib/labels';
import { useRulePreview } from '@/lib/rule-preview';
import { useChannelName, useDestinations, useRule, useSaveRule } from '@/lib/queries';
import { cn } from '@/lib/utils';

const NEW_RULE: AlertRuleInput = {
  category: 'earthquake',
  minSeverity: 4,
  keywords: [],
  destinationIds: [],
};

export function RuleEditorPage() {
  const { ruleId } = useParams();
  const rule = useRule(ruleId);
  const destinations = useDestinations();
  const title = ruleId ? 'Edit alert rule' : 'New alert rule';

  let body;
  if ((ruleId && rule.isPending) || destinations.isPending) {
    body = <Loading label="Loading the rule…" />;
  } else if (ruleId && rule.isError) {
    body =
      rule.error instanceof ApiError && rule.error.status === 404 ? (
        <EmptyState title="This rule doesn't exist" action={<BackToRules />}>
          It may have been deleted.
        </EmptyState>
      ) : (
        <ErrorState
          title="The rule didn't load"
          error={rule.error}
          onRetry={() => void rule.refetch()}
        />
      );
  } else if (destinations.isError) {
    body = (
      <ErrorState
        title="Your destinations didn't load"
        error={destinations.error}
        onRetry={() => void destinations.refetch()}
      />
    );
  } else {
    body = (
      <RuleEditor
        // Remount when switching rules so the form starts from the right values.
        key={ruleId ?? 'new'}
        rule={ruleId ? rule.data : undefined}
        destinations={destinations.data}
      />
    );
  }

  return (
    <PageWidth wide>
      <Link to="/rules" className="mb-6 inline-flex items-center gap-2 text-sm hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All alert rules
      </Link>
      <h1 className="mb-10 text-[34px] sm:text-[44px]">{title}</h1>
      {body}
    </PageWidth>
  );
}

function BackToRules() {
  return (
    <Button asChild>
      <Link to="/rules">Back to alert rules</Link>
    </Button>
  );
}

const ruleFieldSchema = alertRuleInputSchema.keyof();

export function RuleEditor({
  rule,
  destinations,
}: {
  rule?: AlertRule;
  destinations: ChannelDestinationBase[];
}) {
  const id = useId();
  const navigate = useNavigate();
  const save = useSaveRule();
  const channelName = useChannelName();
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AlertRuleInput>({
    resolver: zodResolver(alertRuleInputSchema),
    defaultValues: rule
      ? {
          category: rule.category,
          minSeverity: rule.minSeverity,
          keywords: rule.keywords,
          destinationIds: rule.destinationIds,
        }
      : NEW_RULE,
  });
  const [category, minSeverity, keywords] = useWatch({
    control,
    name: ['category', 'minSeverity', 'keywords'],
  });
  const preview = useRulePreview(category, minSeverity, keywords);

  const onSubmit = handleSubmit(async (input) => {
    try {
      await save.mutateAsync({ input, id: rule?.id });
      toast.success(rule ? 'Rule saved' : 'Rule created');
      await navigate('/rules');
    } catch (error) {
      const issues = error instanceof ApiError ? error.issues : [];
      let placed = false;
      for (const issue of issues) {
        const field = ruleFieldSchema.safeParse(issue.path[0]);
        if (field.success) {
          setError(field.data, { message: issue.message });
          placed = true;
        }
      }
      if (!placed) setError('root', { message: errorMessage(error) });
    }
  });

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="grid gap-10">
        <fieldset className="grid gap-4">
          <legend className="mb-4 font-heading text-xl text-forest">What kind of Event?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {categorySchema.options.map((option) => (
              <label
                key={option}
                className={cn(
                  'relative flex cursor-pointer items-center justify-center border px-3 py-3 text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest',
                  category === option
                    ? 'border-forest bg-forest text-white'
                    : 'border-input hover:border-forest',
                )}
              >
                <input type="radio" value={option} className="sr-only" {...register('category')} />
                {CATEGORY_LABELS[option]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4">
          <label htmlFor={`${id}-severity`} className="font-heading text-xl text-forest">
            How severe, at least?
          </label>
          <Controller
            control={control}
            name="minSeverity"
            render={({ field }) => (
              <SeverityScale
                id={`${id}-severity`}
                value={field.value}
                onChange={field.onChange}
                category={category}
              />
            )}
          />
        </div>

        <div className="grid gap-4">
          <label htmlFor={`${id}-keywords`} className="font-heading text-xl text-forest">
            Keywords <span className="font-sans text-base text-muted-foreground">(optional)</span>
          </label>
          <Controller
            control={control}
            name="keywords"
            render={({ field, fieldState }) => (
              <KeywordInput
                id={`${id}-keywords`}
                value={field.value}
                onChange={field.onChange}
                suggestions={KEYWORD_SUGGESTIONS[category]}
                error={fieldState.error?.message ?? errors.keywords?.root?.message}
              />
            )}
          />
        </div>

        <RulePreviewSummary preview={preview} />

        <fieldset
          className="grid gap-3"
          aria-describedby={errors.destinationIds ? `${id}-dest-error` : undefined}
        >
          <legend className="mb-4 font-heading text-xl text-forest">Where should alerts go?</legend>
          {destinations.length === 0 ? (
            <p>
              You have no destinations yet.{' '}
              <Link to="/destinations" className="underline">
                Add an email address or Slack channel
              </Link>{' '}
              first.
            </p>
          ) : (
            destinations.map((destination) => (
              <label
                key={destination.id}
                className="flex cursor-pointer items-start gap-3 border border-border p-3 hover:border-forest"
              >
                <input
                  type="checkbox"
                  value={destination.id}
                  className="mt-1 size-4 accent-[var(--forest)]"
                  {...register('destinationIds')}
                />
                <span className="grid">
                  <span>{destination.label}</span>
                  <span className="text-sm text-muted-foreground">
                    {channelName(destination.channel)}
                    {' · '}
                    {describeConfig(destination.channel, destination.config)}
                  </span>
                </span>
              </label>
            ))
          )}
          {errors.destinationIds && (
            <p id={`${id}-dest-error`} className="text-sm text-destructive" role="alert">
              {/* The resolver reports zod's issue code as the type; the shared schema's text is generic. */}
              {errors.destinationIds.type === 'too_small'
                ? 'Choose at least one destination.'
                : errors.destinationIds.message}
            </p>
          )}
        </fieldset>

        {errors.root && (
          <p role="alert" className="border-l-4 border-destructive py-1 pl-3">
            {errors.root.message}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : rule ? 'Save rule' : 'Create rule'}
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link to="/rules">Cancel</Link>
          </Button>
        </div>
      </form>
      <div className="lg:sticky lg:top-6">
        <RulePreview preview={preview} />
      </div>
    </div>
  );
}

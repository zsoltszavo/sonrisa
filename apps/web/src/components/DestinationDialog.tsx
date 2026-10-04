import {
  type ChannelDestinationBase,
  type ChannelInfo,
  channelDestinationInputSchema,
} from '@sonrisa/shared';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, errorMessage } from '@/lib/api';
import { useSaveDestination } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  configFields,
  configFromValues,
  type ConfigValues,
  validateConfig,
} from '@/lib/schema-config';
import { SchemaForm } from './SchemaForm';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';

function stringValues(config: unknown): ConfigValues {
  if (typeof config !== 'object' || config === null) return {};
  return Object.fromEntries(
    Object.entries(config).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

/**
 * Add or edit a Channel Destination. The config fields come from the Channel's JSON Schema
 * (GET /channels), so adding a Channel on the server adds its form here with no code change (D11).
 */
export function DestinationDialog({
  open,
  onOpenChange,
  channels,
  destination,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: ChannelInfo[];
  destination?: ChannelDestinationBase;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <DestinationForm
            channels={channels}
            destination={destination}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DestinationForm({
  channels,
  destination,
  onDone,
}: {
  channels: ChannelInfo[];
  destination?: ChannelDestinationBase;
  onDone: () => void;
}) {
  const id = useId();
  const save = useSaveDestination();
  const [channelKey, setChannelKey] = useState(destination?.channel ?? channels[0]?.key ?? '');
  const [label, setLabel] = useState(destination?.label ?? '');
  const [values, setValues] = useState<ConfigValues>(stringValues(destination?.config));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const channel = channels.find((c) => c.key === channelKey);
  const fields = channel ? configFields(channel.configSchema) : null;

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channel || !fields) return;
    const next: Record<string, string> = {};
    const parsedLabel = channelDestinationInputSchema.shape.label.safeParse(label);
    if (!parsedLabel.success) next.label = 'Give the destination a name, up to 100 characters.';
    const configErrors = validateConfig(fields, values);
    for (const [key, message] of Object.entries(configErrors)) next[`config.${key}`] = message;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    try {
      await save.mutateAsync({
        input: {
          channel: channel.key,
          label: label.trim(),
          config: configFromValues(fields, values),
        },
        id: destination?.id,
      });
      toast.success(destination ? 'Destination saved' : 'Destination added');
      onDone();
    } catch (error) {
      // The server knows more than the schema (e.g. the Slack host allowlist): show its issues in place.
      // Anything without a field on screen (e.g. a whole-config issue) goes in the form-level message.
      const shown = new Set(['label', ...fields.map((field) => `config.${field.name}`)]);
      const placed: Record<string, string> = {};
      const unplaced: string[] = [];
      for (const issue of error instanceof ApiError ? error.issues : []) {
        const key = issue.path.join('.');
        if (shown.has(key)) placed[key] = issue.message;
        else unplaced.push(issue.message);
      }
      setErrors(placed);
      if (unplaced.length > 0) setFormError(unplaced.join(' '));
      else if (Object.keys(placed).length === 0) setFormError(errorMessage(error));
    }
  }

  const configErrors = Object.fromEntries(
    Object.entries(errors)
      .filter(([key]) => key.startsWith('config.'))
      .map(([key, message]) => [key.slice('config.'.length), message]),
  );

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-6">
      <DialogHeader>
        <DialogTitle className="font-heading text-2xl font-medium text-forest">
          {destination ? 'Edit destination' : 'Add a destination'}
        </DialogTitle>
        <DialogDescription>
          A destination is one place alerts can go, like your inbox or a team's Slack channel.
        </DialogDescription>
      </DialogHeader>

      {!destination && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Channel</legend>
          <div className="flex flex-wrap gap-2">
            {channels.map((option) => (
              <label
                key={option.key}
                className={cn(
                  'relative cursor-pointer border px-4 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest',
                  channelKey === option.key
                    ? 'border-forest bg-forest text-white'
                    : 'border-input hover:border-forest',
                )}
              >
                <input
                  type="radio"
                  name={`${id}-channel`}
                  value={option.key}
                  checked={channelKey === option.key}
                  onChange={() => {
                    setChannelKey(option.key);
                    setValues({});
                    setErrors({});
                  }}
                  className="sr-only"
                />
                {option.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-2">
        <Label htmlFor={`${id}-label`}>Name</Label>
        <Input
          id={`${id}-label`}
          value={label}
          placeholder={channelKey === 'slack' ? 'Team · #ops-alerts' : 'My work email'}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={errors.label ? `${id}-label-error` : undefined}
        />
        {errors.label && (
          <p id={`${id}-label-error`} className="text-sm text-destructive">
            {errors.label}
          </p>
        )}
      </div>

      {fields ? (
        <SchemaForm
          fields={fields}
          values={values}
          errors={configErrors}
          onChange={setValues}
          idPrefix={`${id}-config`}
        />
      ) : (
        <p role="alert" className="border-l-4 border-destructive pl-3 text-sm">
          The settings for this Channel can't be shown here. Ask an Admin to check the Channel's
          configuration.
        </p>
      )}

      {formError && (
        <p role="alert" className="border-l-4 border-destructive py-1 pl-3 text-sm">
          {formError}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || !fields}>
          {save.isPending ? 'Saving…' : destination ? 'Save destination' : 'Add destination'}
        </Button>
      </DialogFooter>
    </form>
  );
}

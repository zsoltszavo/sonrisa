import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  configFields,
  configFromValues,
  type ConfigValues,
  validateConfig,
} from '@/lib/schema-config';
import { SchemaForm } from './SchemaForm';

// Copied from GET /api/channels (S6), so the tests use the shape the server really sends.
const EMAIL_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    to: {
      title: 'Email address',
      description: 'Alerts are sent to this address.',
      format: 'email',
      type: 'string',
    },
  },
  required: ['to'],
  additionalProperties: false,
};
const SLACK_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { webhookUrl: { type: 'string', format: 'uri', title: 'Webhook URL' } },
  required: ['webhookUrl'],
  additionalProperties: false,
};
// A made-up future Channel, to show a new provider needs no frontend change.
const SMS_SCHEMA = {
  type: 'object',
  properties: {
    phone: { type: 'string', title: 'Phone number', pattern: '^\\+[0-9]{8,15}$' },
    note: { type: 'string', maxLength: 5 },
  },
  required: ['phone'],
};

function fieldsOf(schema: unknown) {
  const fields = configFields(schema);
  if (!fields) throw new Error('schema not supported');
  return fields;
}

function Harness({ schema }: { schema: unknown }) {
  const fields = fieldsOf(schema);
  const [values, setValues] = useState<ConfigValues>({});
  const errors = validateConfig(fields, values);
  return (
    <>
      <SchemaForm
        fields={fields}
        values={values}
        errors={errors}
        onChange={setValues}
        idPrefix="t"
      />
      <output data-testid="config">{JSON.stringify(configFromValues(fields, values))}</output>
    </>
  );
}

describe('SchemaForm', () => {
  it('renders an email input with the title, description and required state from the schema', () => {
    render(<Harness schema={EMAIL_SCHEMA} />);
    const input = screen.getByRole('textbox', { name: 'Email address' });
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription(/Alerts are sent to this address\./);
  });

  it('shows a field error as the user types and links it to the input', async () => {
    const user = userEvent.setup();
    render(<Harness schema={EMAIL_SCHEMA} />);
    const input = screen.getByRole('textbox', { name: 'Email address' });

    await user.type(input, 'not-an-email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Enter an email address like name@example\.com\./);

    await user.clear(input);
    await user.type(input, '  me@example.com ');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('config')).toHaveTextContent('{"to":"me@example.com"}');
  });

  it('renders a URL input for format "uri" and falls back to the property name without a title', () => {
    render(<Harness schema={SLACK_SCHEMA} />);
    expect(screen.getByRole('textbox', { name: 'Webhook URL' })).toHaveAttribute('type', 'url');

    render(<Harness schema={SMS_SCHEMA} />);
    expect(screen.getByRole('textbox', { name: /^note\s*\(optional\)$/ })).not.toBeRequired();
  });
});

describe('configFields', () => {
  it('refuses schemas outside the supported subset instead of guessing', () => {
    expect(
      configFields({ type: 'object', properties: { retries: { type: 'integer' } } }),
    ).toBeNull();
    expect(configFields({ type: 'array' })).toBeNull();
    expect(configFields(null)).toBeNull();
  });
});

describe('validateConfig', () => {
  const sms = fieldsOf(SMS_SCHEMA);
  const slack = fieldsOf(SLACK_SCHEMA);

  it('requires required fields and leaves empty optional ones alone', () => {
    expect(validateConfig(sms, {})).toEqual({ phone: 'Enter the phone number.' });
    expect(configFromValues(sms, { phone: '+3612345678', note: ' ' })).toEqual({
      phone: '+3612345678',
    });
  });

  it('checks pattern and length', () => {
    expect(validateConfig(sms, { phone: '0612345678' })).toHaveProperty('phone');
    expect(validateConfig(sms, { phone: '+3612345678', note: 'too long' })).toEqual({
      note: 'Use at most 5 characters.',
    });
  });

  it('accepts only http(s) URLs for format "uri"', () => {
    expect(validateConfig(slack, { webhookUrl: 'javascript:alert(1)' })).toHaveProperty(
      'webhookUrl',
    );
    expect(validateConfig(slack, { webhookUrl: 'https://hooks.slack.com/services/T/B/x' })).toEqual(
      {},
    );
  });
});

import {
  type AlertRule,
  type AlertRuleInput,
  alertRuleSchema,
  type AuthResponse,
  authResponseSchema,
  type Category,
  type ChannelDestinationBase,
  type ChannelDestinationInput,
  channelDestinationBaseSchema,
  type ChannelInfo,
  channelInfoSchema,
  healthResponseSchema,
  type HealthResponse,
  type MyNotification,
  myNotificationSchema,
  type StoredEvent,
  storedEventSchema,
  type TestDeliveryResult,
  testDeliveryResultSchema,
  type User,
  userSchema,
  type ValidationIssue,
  validationIssueSchema,
} from '@sonrisa/shared';
import { z } from 'zod';
import { session } from './session';

/** A non-2xx answer from the API, with the server's message and validation issues when it sent them. */
export class ApiError extends Error {
  readonly status: number;
  readonly issues: ValidationIssue[];
  readonly body: unknown;

  constructor(
    status: number,
    message: string,
    issues: ValidationIssue[] = [],
    body: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
    this.body = body;
  }
}

/** Text for an error state or toast: the server's own message when there is one. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return `Something unexpected happened: ${error.message}`;
  return 'Something unexpected happened.';
}

const errorBodySchema = z.object({
  message: z.union([z.string(), z.array(z.string())]).optional(),
  // Validation failures use the shared `validationErrorBodySchema`; other errors are Nest's default body.
  issues: z.array(validationIssueSchema).optional(),
});

async function errorFrom(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = errorBodySchema.safeParse(body);
  const message = parsed.success ? parsed.data.message : undefined;
  return new ApiError(
    response.status,
    (Array.isArray(message) ? message.join(', ') : message) ??
      `The server answered ${String(response.status)} ${response.statusText}`.trim(),
    parsed.success ? (parsed.data.issues ?? []) : [],
    body,
  );
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

async function send(path: string, { method = 'GET', body }: RequestOptions): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json' });
  const token = session.getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError(
      0,
      'Could not reach the server. Check your connection and try again.',
      [],
      cause,
    );
  }
  // An expired or revoked token: drop it so the route guard sends the user to sign in. Only if it is
  // still the current one: a late 401 for an old token must not end a newer session.
  if (response.status === 401 && token && session.getToken() === token) session.signOut();
  if (!response.ok) throw await errorFrom(response);
  return response;
}

/** Sends a request and parses the JSON answer with a shared schema, so a contract drift fails loudly. */
async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.output<S>> {
  const response = await send(path, options);
  return schema.parse(await response.json());
}

async function requestNoContent(path: string, options: RequestOptions): Promise<void> {
  await send(path, options);
}

/**
 * GET /api/health. A 503 still carries a valid body (`database: "down"`),
 * so we parse it instead of treating every non-2xx as an unknown failure.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  if (!response.ok && response.status !== 503) {
    throw new Error(`Health check failed: HTTP ${String(response.status)}`);
  }
  return healthResponseSchema.parse(await response.json());
}

/** Ids are encoded: route params are decoded, so a crafted link could otherwise reach another path. */
export const api = {
  login: (email: string, password: string): Promise<AuthResponse> =>
    request('/auth/login', authResponseSchema, { method: 'POST', body: { email, password } }),
  me: (): Promise<User> => request('/me', userSchema),

  channels: (): Promise<ChannelInfo[]> => request('/channels', z.array(channelInfoSchema)),

  destinations: (): Promise<ChannelDestinationBase[]> =>
    request('/destinations', z.array(channelDestinationBaseSchema)),
  saveDestination: (
    input: ChannelDestinationInput,
    id?: string,
  ): Promise<ChannelDestinationBase> =>
    id
      ? request(`/destinations/${encodeURIComponent(id)}`, channelDestinationBaseSchema, {
          method: 'PUT',
          body: input,
        })
      : request('/destinations', channelDestinationBaseSchema, { method: 'POST', body: input }),
  deleteDestination: (id: string): Promise<void> =>
    requestNoContent(`/destinations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testDestination: (id: string): Promise<TestDeliveryResult> =>
    request(`/destinations/${encodeURIComponent(id)}/test`, testDeliveryResultSchema, {
      method: 'POST',
    }),

  rules: (): Promise<AlertRule[]> => request('/rules', z.array(alertRuleSchema)),
  rule: (id: string): Promise<AlertRule> =>
    request(`/rules/${encodeURIComponent(id)}`, alertRuleSchema),
  saveRule: (input: AlertRuleInput, id?: string): Promise<AlertRule> =>
    id
      ? request(`/rules/${encodeURIComponent(id)}`, alertRuleSchema, { method: 'PUT', body: input })
      : request('/rules', alertRuleSchema, { method: 'POST', body: input }),
  deleteRule: (id: string): Promise<void> =>
    requestNoContent(`/rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  recentEvents: (category: Category): Promise<StoredEvent[]> =>
    request(`/events/recent?category=${category}`, z.array(storedEventSchema)),
  myNotifications: (): Promise<MyNotification[]> =>
    request('/me/notifications', z.array(myNotificationSchema)),
};

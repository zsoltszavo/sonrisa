import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { session } from './session';

afterEach(() => {
  session.signOut();
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('signs out on a 401 for the current token', async () => {
    session.signIn('expired');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 401 }))),
    );
    await expect(api.rules()).rejects.toBeInstanceOf(ApiError);
    expect(session.getToken()).toBeNull();
  });

  it('keeps a newer session when a late 401 arrives for an old token', async () => {
    session.signIn('old');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        session.signIn('new'); // the user signed in again while the request was in flight
        return Promise.resolve(new Response('{}', { status: 401 }));
      }),
    );
    await expect(api.rules()).rejects.toBeInstanceOf(ApiError);
    expect(session.getToken()).toBe('new');
  });

  it('encodes ids so a crafted route param cannot reach another API path', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.resolve(new Response('{}', { status: 404 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.rule('../admin/users')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/rules/..%2Fadmin%2Fusers');
  });

  it('keeps the validation issues of a 400', async () => {
    const body = {
      message: 'Validation failed',
      issues: [{ path: ['label'], message: 'Too long' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 400 }))),
    );
    await expect(api.rules()).rejects.toMatchObject({ status: 400, issues: body.issues });
  });
});

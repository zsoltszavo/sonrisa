import { JwtService } from '@nestjs/jwt';
import { authResponseSchema, userSchema } from '@sonrisa/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  registerAdmin,
  registerUser,
  type TestApp,
  uniqueEmail,
} from './support.js';

let app: TestApp;
const api = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/auth/register', () => {
  it('creates a `user` (never an admin) and never returns the password hash', async () => {
    const email = uniqueEmail('Reg');
    const response = await api()
      .post('/api/auth/register')
      // `role` in the body is ignored: the schema doesn't know it and the service never reads it.
      .send({
        email: `  ${email.toUpperCase()} `,
        password: 'correct-horse-battery',
        role: 'admin',
      })
      .expect(201);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|argon2/);
    const { user } = authResponseSchema.parse(response.body);
    expect(user).toMatchObject({ email: email.toLowerCase(), role: 'user' });

    const stored = await app.get(PrismaService).user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('refuses a second account with the same email, whatever its case (409)', async () => {
    const email = uniqueEmail('dup');
    await api()
      .post('/api/auth/register')
      .send({ email, password: 'correct-horse-battery' })
      .expect(201);
    await api()
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), password: 'correct-horse-battery' })
      .expect(409);
  });

  it('validates the body with the shared schema (400)', async () => {
    const response = await api()
      .post('/api/auth/register')
      .send({ email: uniqueEmail('short'), password: 'short' })
      .expect(400);
    expect(response.body).toMatchObject({ issues: [{ path: ['password'] }] });
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with the right password, case-insensitively on the email', async () => {
    const email = uniqueEmail('login');
    await api()
      .post('/api/auth/register')
      .send({ email, password: 'correct-horse-battery' })
      .expect(201);
    const response = await api()
      .post('/api/auth/login')
      .send({ email: email.toUpperCase(), password: 'correct-horse-battery' })
      .expect(200);
    expect(authResponseSchema.parse(response.body).user.email).toBe(email);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const email = uniqueEmail('login');
    await api()
      .post('/api/auth/register')
      .send({ email, password: 'correct-horse-battery' })
      .expect(201);
    const wrongPassword = await api()
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password-123' })
      .expect(401);
    const unknownEmail = await api()
      .post('/api/auth/login')
      .send({ email: uniqueEmail('nobody'), password: 'wrong-password-123' })
      .expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe('GET /api/me', () => {
  it('returns the signed-in user without the password hash', async () => {
    const alice = await registerUser(app, 'alice');
    const response = await api().get('/api/me').set('Authorization', alice.auth).expect(200);
    expect(response.body).toEqual(alice.user);
    expect(userSchema.strict().safeParse(response.body).success).toBe(true);
  });

  it('accepts the scheme in any case (RFC 7235)', async () => {
    const alice = await registerUser(app, 'alice');
    await api().get('/api/me').set('Authorization', `bearer ${alice.token}`).expect(200);
  });

  it.each([
    ['no Authorization header', undefined],
    ['a non-Bearer scheme', 'Basic abc'],
    ['a malformed token', 'Bearer not-a-jwt'],
  ])('answers 401 with %s', async (_label, header) => {
    const call = api().get('/api/me');
    if (header) void call.set('Authorization', header);
    await call.expect(401);
  });

  it('rejects a token signed with another secret (401)', async () => {
    const alice = await registerUser(app, 'alice');
    const forged = new JwtService({ secret: 'x'.repeat(48) }).sign({ sub: alice.user.id });
    await api().get('/api/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('rejects an unsigned `alg: none` token (401)', async () => {
    const alice = await registerUser(app, 'alice');
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: alice.user.id })}.`;
    await api().get('/api/me').set('Authorization', `Bearer ${unsigned}`).expect(401);
  });

  it("rejects a valid token once the user's account is gone (401)", async () => {
    const bob = await registerUser(app, 'bob');
    await app.get(PrismaService).user.delete({ where: { id: bob.user.id } });
    await api().get('/api/me').set('Authorization', bob.auth).expect(401);
  });
});

describe('/api/admin/*', () => {
  it('answers 401 without a token', async () => {
    await api().get('/api/admin/event-sources').expect(401);
  });

  it('answers 403 to a non-admin', async () => {
    const alice = await registerUser(app, 'alice');
    await api().get('/api/admin/event-sources').set('Authorization', alice.auth).expect(403);
  });

  it('serves an admin', async () => {
    const admin = await registerAdmin(app);
    const response = await api()
      .get('/api/admin/event-sources')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('reads the role from the database, so a demoted admin loses access with the same token', async () => {
    const admin = await registerAdmin(app);
    await app
      .get(PrismaService)
      .user.update({ where: { id: admin.user.id }, data: { role: 'user' } });
    await api().get('/api/admin/event-sources').set('Authorization', admin.auth).expect(403);
  });
});

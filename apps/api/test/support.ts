import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { authResponseSchema, type User } from '@sonrisa/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export type TestApp = INestApplication<Server>;

/** `override` can swap providers, e.g. the FeedFetcher for the saved feed samples. */
export async function createTestApp(
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<TestApp> {
  const moduleRef = await override(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication<INestApplication<Server>>();
  configureApp(app);
  await app.init();
  return app;
}

export interface TestUser {
  user: User;
  token: string;
  /** Ready-made Authorization header value. */
  auth: string;
}

/** A unique email per call, so tests never collide with each other or with seeded/dev data. */
export function uniqueEmail(name: string): string {
  return `${name}-${randomUUID()}@e2e.test`;
}

export async function registerUser(app: TestApp, name: string): Promise<TestUser> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: uniqueEmail(name), password: 'correct-horse-battery' })
    .expect(201);
  const { accessToken, user } = authResponseSchema.parse(response.body);
  return { user, token: accessToken, auth: `Bearer ${accessToken}` };
}

/** Admins can't self-register (D9); tests promote a fresh user directly in the database. */
export async function registerAdmin(app: TestApp): Promise<TestUser> {
  const registered = await registerUser(app, 'admin');
  await app.get(PrismaService).user.update({
    where: { id: registered.user.id },
    data: { role: 'admin' },
  });
  return { ...registered, user: { ...registered.user, role: 'admin' } };
}

import type { Category, Severity } from '@sonrisa/shared';
import { hashPassword } from '../auth/password.js';
import type { PrismaClient } from '../generated/prisma/client.js';

/** Demo accounts (D9). `.test` is a reserved TLD (RFC 2606), so these can never be real inboxes. */
export const DEMO_USERS = {
  admin: { email: 'admin@demo.test', password: 'sonrisa-admin-demo', role: 'admin' },
  alice: { email: 'alice@demo.test', password: 'sonrisa-alice-demo', role: 'user' },
} as const;

/** Where the Slack Stand-in (D12, built in S5) will accept webhooks; S5 owns this URL. */
export const SLACK_STANDIN_WORLD_ALERTS_URL = 'http://localhost:4010/hooks/world-alerts';

export const EVENT_SOURCES = [
  { key: 'usgs', name: 'USGS earthquakes', intervalSec: 60 },
  { key: 'gdacs', name: 'GDACS disasters', intervalSec: 300 },
  { key: 'simulated', name: 'Simulated Source', intervalSec: null },
] as const;

/** Creates missing Event Sources; never overwrites an admin's changes to existing ones. */
export async function seedEventSources(prisma: PrismaClient): Promise<void> {
  for (const source of EVENT_SOURCES) {
    await prisma.eventSource.upsert({ where: { key: source.key }, create: source, update: {} });
  }
}

interface SeedRule {
  id: string;
  category: Category;
  minSeverity: Severity;
  keywords: string[];
  destinationIds: string[];
}

/**
 * Idempotent: fixed ids and upserts, so running it again restores the demo data
 * without duplicating it or touching anything users created themselves.
 */
export async function seed(prisma: PrismaClient): Promise<void> {
  await seedEventSources(prisma);

  const upsertUser = async ({
    email,
    password,
    role,
  }: (typeof DEMO_USERS)[keyof typeof DEMO_USERS]) => {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, role },
      update: { passwordHash, role },
      select: { id: true },
    });
    return user.id;
  };
  await upsertUser(DEMO_USERS.admin);
  const aliceId = await upsertUser(DEMO_USERS.alice);

  const destinations = [
    {
      id: 'seed-alice-email',
      channel: 'email',
      label: 'My email',
      config: { to: DEMO_USERS.alice.email },
    },
    {
      id: 'seed-alice-slack',
      channel: 'slack',
      label: 'sonrisa · #world-alerts',
      config: { webhookUrl: SLACK_STANDIN_WORLD_ALERTS_URL },
    },
  ];
  for (const { id, ...data } of destinations) {
    await prisma.channelDestination.upsert({
      where: { id },
      create: { id, userId: aliceId, ...data },
      update: data,
    });
  }

  const rules: SeedRule[] = [
    {
      id: 'seed-alice-big-quakes',
      category: 'earthquake',
      minSeverity: 4,
      keywords: [],
      destinationIds: ['seed-alice-email', 'seed-alice-slack'],
    },
    {
      id: 'seed-alice-japan-quakes',
      category: 'earthquake',
      minSeverity: 2,
      keywords: ['Japan', 'Tokyo'],
      destinationIds: ['seed-alice-email'],
    },
    {
      id: 'seed-alice-disasters',
      category: 'disaster',
      minSeverity: 4,
      keywords: [],
      destinationIds: ['seed-alice-slack'],
    },
    {
      id: 'seed-alice-oil-news',
      category: 'news',
      minSeverity: 3,
      keywords: ['oil', 'OPEC'],
      destinationIds: ['seed-alice-email'],
    },
  ];
  for (const { id, destinationIds, ...data } of rules) {
    const links = destinationIds.map((destinationId) => ({ destinationId }));
    await prisma.alertRule.upsert({
      where: { id },
      create: { id, userId: aliceId, ...data, destinations: { create: links } },
      update: { ...data, destinations: { deleteMany: {}, create: links } },
    });
  }
}

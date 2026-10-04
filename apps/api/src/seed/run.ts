import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../generated/prisma/client.js';
import { seed } from './seed.js';

// Run by `prisma db seed` / `prisma migrate reset` (see prisma.config.ts).
config({ path: path.resolve(import.meta.dirname, '../../../../.env'), quiet: true });
const connectionString = process.env['DATABASE_URL'];
if (!connectionString) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  await seed(prisma);
  console.log('Seeded demo data: admin@demo.test, alice@demo.test');
} finally {
  await prisma.$disconnect();
}

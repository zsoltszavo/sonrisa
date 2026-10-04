import { Prisma } from '../generated/prisma/client.js';

/**
 * P2002: unique constraint failed. P2003: foreign key constraint failed.
 * P2025: the record to update/delete/connect was not found.
 */
export function isPrismaError(error: unknown, code: 'P2002' | 'P2003' | 'P2025'): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

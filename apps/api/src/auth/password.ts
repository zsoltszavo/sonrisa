import argon2 from 'argon2';

/** argon2id with the library defaults (m=64 MiB, t=3, p=4). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

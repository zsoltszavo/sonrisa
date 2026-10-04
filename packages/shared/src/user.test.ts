import { describe, expect, it } from 'vitest';
import { loginInputSchema, registerInputSchema, userSchema } from './user.js';

describe('registerInputSchema', () => {
  it('lower-cases and trims the email', () => {
    expect(
      registerInputSchema.parse({ email: '  Alice@Demo.TEST ', password: 'a-long-password' }).email,
    ).toBe('alice@demo.test');
  });

  it.each([
    ['a short password', { email: 'a@demo.test', password: 'short' }],
    ['a huge password', { email: 'a@demo.test', password: 'x'.repeat(201) }],
    ['an invalid email', { email: 'not-an-email', password: 'a-long-password' }],
  ])('rejects %s', (_label, input) => {
    expect(registerInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('loginInputSchema', () => {
  it('accepts a short password (the policy is only checked at registration)', () => {
    expect(loginInputSchema.safeParse({ email: 'a@demo.test', password: 'x' }).success).toBe(true);
  });
});

describe('userSchema', () => {
  it('strips unknown fields such as a password hash', () => {
    const parsed = userSchema.parse({
      id: 'u1',
      email: 'a@demo.test',
      role: 'user',
      passwordHash: '$argon2id$...',
    });
    expect(parsed).not.toHaveProperty('passwordHash');
  });
});

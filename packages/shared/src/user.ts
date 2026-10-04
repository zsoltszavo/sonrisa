import { z } from 'zod';

export const roleSchema = z.enum(['user', 'admin']);
export type Role = z.infer<typeof roleSchema>;

/** Lower-cased and trimmed, so `Alice@Demo.test` and `alice@demo.test` are one account. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const MIN_PASSWORD_LENGTH = 12;
/** argon2 accepts any length; the cap stops a multi-megabyte password from being hashed. */
export const MAX_PASSWORD_LENGTH = 200;

export const registerInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

/** Login doesn't repeat the password policy: a wrong password is just a 401. */
export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

/** The only shape a User leaves the API in (never the password hash). */
export const userSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  role: roleSchema,
});
export type User = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

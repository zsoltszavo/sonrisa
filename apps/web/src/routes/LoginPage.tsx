import { zodResolver } from '@hookform/resolvers/zod';
import { loginInputSchema } from '@sonrisa/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wordmark } from '@/components/Wordmark';
import { useSignIn } from '@/lib/auth';

type LoginForm = z.input<typeof loginInputSchema>;

/**
 * Sign-in, laid out like the sonrisa.hu hero: a large display headline in a mist panel, with
 * the form beside it. Accounts are created by the seed (D9), so there is no sign-up here.
 */
export function LoginPage() {
  const signIn = useSignIn();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginInputSchema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFailure(null);
    try {
      // RedirectIfSignedIn takes the user back to where they were going.
      await signIn(email, password);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  });

  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <section className="flex flex-col justify-between gap-12 bg-mist px-[15px] py-8 md:px-[30px] lg:py-[22px]">
        <Wordmark />
        <div className="pb-6 lg:pb-24">
          <h1 className="max-w-[13ch] text-[40px] leading-none sm:text-[56px] xl:text-[64px]">
            Hear about the events that matter to you.
          </h1>
        </div>
        <p className="max-w-[52ch] text-[15px]">
          Earthquakes, disasters, news and market moves, checked against your own alert rules and
          delivered to your email or Slack.
        </p>
      </section>
      <section className="flex items-center px-[15px] py-12 md:px-[30px]">
        <form
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="mx-auto grid w-full max-w-sm gap-6"
          aria-labelledby="sign-in-title"
        >
          <h2 id="sign-in-title" className="text-[29px]">
            Sign in
          </h2>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
            {errors.email && (
              <p id="email-error" className="text-sm text-destructive">
                Enter the email address you were given.
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            {errors.password && (
              <p id="password-error" className="text-sm text-destructive">
                Enter your password.
              </p>
            )}
          </div>
          {failure && (
            <p role="alert" className="border-l-4 border-destructive py-1 pl-3 text-sm">
              {failure}
            </p>
          )}
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
          {import.meta.env.DEV && (
            <p className="text-sm text-muted-foreground">
              Demo account: alice@demo.test / sonrisa-alice-demo
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

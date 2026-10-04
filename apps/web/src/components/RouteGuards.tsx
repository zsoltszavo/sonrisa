import { Navigate, Outlet, useLocation } from 'react-router';
import { z } from 'zod';
import { useCurrentUser } from '@/lib/auth';
import { ErrorState, Loading } from './States';

/**
 * Sends signed-out visitors to /login and remembers where they were going. This is UX only:
 * every API route checks the token and role itself (AI-shortcut checklist, D9).
 */
export function RequireAuth() {
  const location = useLocation();
  const { token, isPending } = useCurrentUser();
  if (token === null) {
    const from = location.pathname + location.search + location.hash;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  // A failed /me with the token still set is a network or server problem (a 401 clears the token),
  // so the pages render and show their own error states.
  if (isPending) return <Loading label="Signing you in…" />;
  return <Outlet />;
}

const fromSchema = z.object({ from: z.string().startsWith('/') });

/**
 * Keeps signed-in users off /login. Signing in only stores the token; this guard then sends the
 * user back where RequireAuth found them, so there is one redirect and nothing to race with.
 */
export function RedirectIfSignedIn() {
  const { token } = useCurrentUser();
  const location = useLocation();
  if (token === null) return <Outlet />;
  const state = fromSchema.safeParse(location.state);
  // `//evil.example` starts with "/" but would leave the app: only same-origin paths.
  const to =
    state.success && !state.data.from.startsWith('//') ? state.data.from : '/notifications';
  return <Navigate to={to} replace />;
}

/**
 * Keeps the Admin area to admins. UX only: every /api/admin route answers 403 to anyone else,
 * whatever the browser shows (AI-shortcut checklist).
 */
export function RequireAdmin() {
  const { data: user, isPending, isError, error, refetch } = useCurrentUser();
  if (isPending) return <Loading label="Checking your access…" />;
  if (isError) {
    return (
      <ErrorState
        title="We couldn't check your access"
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }
  if (user.role !== 'admin') return <Navigate to="/notifications" replace />;
  return <Outlet />;
}

import type { User } from '@sonrisa/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { api } from './api';
import { queryKeys } from './queries';
import { session } from './session';

export const useToken = () => useSyncExternalStore(session.subscribe, session.getToken);

/** The signed-in User, read from GET /me whenever there is a token. */
export function useCurrentUser() {
  const token = useToken();
  const query = useQuery({
    queryKey: [...queryKeys.me, token],
    queryFn: api.me,
    enabled: token !== null,
    staleTime: 5 * 60_000,
  });
  return { token, ...query };
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useCallback(
    async (email: string, password: string): Promise<User> => {
      const { accessToken, user } = await api.login(email, password);
      // Another user's cached rules or destinations must never show after switching accounts.
      queryClient.clear();
      queryClient.setQueryData([...queryKeys.me, accessToken], user);
      session.signIn(accessToken);
      return user;
    },
    [queryClient],
  );
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    session.signOut();
    queryClient.clear();
  }, [queryClient]);
}

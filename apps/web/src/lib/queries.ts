import type { AlertRuleInput, Category, ChannelDestinationInput } from '@sonrisa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const queryKeys = {
  me: ['me'] as const,
  channels: ['channels'] as const,
  destinations: ['destinations'] as const,
  rules: ['rules'] as const,
  rule: (id: string) => ['rules', id] as const,
  recentEvents: (category: Category) => ['events', 'recent', category] as const,
  notifications: ['notifications'] as const,
};

export const useChannels = () =>
  useQuery({ queryKey: queryKeys.channels, queryFn: api.channels, staleTime: Infinity });

export const useDestinations = () =>
  useQuery({ queryKey: queryKeys.destinations, queryFn: api.destinations });

export const useRules = () => useQuery({ queryKey: queryKeys.rules, queryFn: api.rules });

export const useRule = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.rule(id ?? ''),
    queryFn: () => api.rule(id ?? ''),
    enabled: id !== undefined,
  });

export const useRecentEvents = (category: Category) =>
  useQuery({
    queryKey: queryKeys.recentEvents(category),
    queryFn: () => api.recentEvents(category),
    staleTime: 60_000,
  });

export const useMyNotifications = () =>
  useQuery({
    queryKey: queryKeys.notifications,
    queryFn: api.myNotifications,
    // New Notifications arrive in the background (polling + matching), so keep the feed fresh.
    refetchInterval: 30_000,
  });

export function useSaveDestination() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, id }: { input: ChannelDestinationInput; id?: string }) =>
      api.saveDestination(input, id),
    // My notifications shows destination labels, so a rename must reach it too.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.destinations }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
      ]),
  });
}

export function useDeleteDestination() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteDestination,
    // Its past Notifications now read "a deleted destination" (D19b).
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.destinations }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
      ]),
  });
}

export const useTestDestination = () => useMutation({ mutationFn: api.testDestination });

export function useSaveRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, id }: { input: AlertRuleInput; id?: string }) => api.saveRule(input, id),
    // Prefix match: refreshes the list and the single-rule entry.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rules }),
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rules }),
  });
}

/** A Channel's display name from GET /channels, falling back to its key while loading. */
export function useChannelName(): (key: string) => string {
  const channels = useChannels();
  return (key) => channels.data?.find((channel) => channel.key === key)?.name ?? key;
}

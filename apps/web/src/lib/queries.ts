import type {
  AlertRuleInput,
  Category,
  ChannelDestinationInput,
  EventSourceKey,
  EventSourceUpdate,
  NotificationStatus,
  SimulatedEventInput,
} from '@sonrisa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type AdminEventFilters, api } from './api';

export const queryKeys = {
  me: ['me'] as const,
  channels: ['channels'] as const,
  destinations: ['destinations'] as const,
  rules: ['rules'] as const,
  rule: (id: string) => ['rules', id] as const,
  recentEvents: (category: Category) => ['events', 'recent', category] as const,
  notifications: ['notifications'] as const,
  admin: {
    all: ['admin'] as const,
    eventSources: ['admin', 'event-sources'] as const,
    events: (filters: AdminEventFilters) => ['admin', 'events', 'list', filters] as const,
    event: (id: string) => ['admin', 'events', 'detail', id] as const,
    notifications: (status?: NotificationStatus) =>
      ['admin', 'notifications', status ?? 'all'] as const,
  },
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

// ---- Admin (D10). Every call is admin-only on the server; these hooks only run under RequireAdmin.

export const useEventSources = () =>
  useQuery({
    queryKey: queryKeys.admin.eventSources,
    queryFn: api.admin.eventSources,
    // The scheduler updates "last poll" in the background.
    refetchInterval: 15_000,
  });

export function useUpdateEventSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, update }: { key: EventSourceKey; update: EventSourceUpdate }) =>
      api.admin.updateEventSource(key, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.eventSources }),
  });
}

export function usePollNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.admin.pollNow,
    // A poll changes the source's status and may store Events and queue Notifications.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });
}

export const useAdminEvents = (filters: AdminEventFilters, options: { live?: boolean } = {}) =>
  useQuery({
    queryKey: queryKeys.admin.events(filters),
    queryFn: () => api.admin.events(filters),
    refetchInterval: options.live ? 5_000 : false,
  });

export const useAdminEvent = (id: string | undefined, options: { live?: boolean } = {}) =>
  useQuery({
    queryKey: queryKeys.admin.event(id ?? ''),
    queryFn: () => api.admin.event(id ?? ''),
    enabled: id !== undefined,
    // The console watches Notifications being delivered (and Escalations appear) as it happens.
    // A failed load (e.g. a mistyped ?event= id) stops polling until "Try again" (CR64).
    refetchInterval: (query) => (options.live && query.state.status !== 'error' ? 2_000 : false),
  });

export const useAdminNotifications = (status?: NotificationStatus) =>
  useQuery({
    queryKey: queryKeys.admin.notifications(status),
    queryFn: () => api.admin.notifications(status),
    refetchInterval: 10_000,
  });

export function useSaveSimulatedEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, id }: { input: SimulatedEventInput; id?: string }) =>
      api.admin.saveSimulatedEvent(input, id),
    // New Events, revisions and Notifications show up across the explorer, the log and My notifications.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
        queryClient.invalidateQueries({ queryKey: ['events', 'recent'] }),
      ]),
  });
}

export function useRetryNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.admin.retryNotification,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
      ]),
  });
}

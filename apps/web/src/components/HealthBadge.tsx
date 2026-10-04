import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Small API/database status line for the footer (the S1 scaffold check, kept as a live signal). */
export function HealthBadge() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 60_000,
  });
  const [text, ok] = isPending
    ? ['Checking…', true]
    : isError
      ? ['API unreachable', false]
      : data.database === 'up'
        ? ['Database up', true]
        : ['Database down', false];
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span
        className={cn('size-2 rounded-full', ok ? 'bg-lime' : 'bg-destructive')}
        aria-hidden="true"
      />
      {text}
    </span>
  );
}

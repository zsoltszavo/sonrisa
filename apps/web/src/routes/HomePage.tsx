import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchHealth } from '@/lib/api';

export function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Sonrisa — World Event Alerts</CardTitle>
          <CardDescription>Scaffold check: web → API → Postgres.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">API status</span>
          <HealthBadge
            isPending={health.isPending}
            isError={health.isError}
            database={health.data?.database}
          />
        </CardContent>
      </Card>
    </main>
  );
}

function HealthBadge(props: { isPending: boolean; isError: boolean; database?: 'up' | 'down' }) {
  if (props.isPending) return <Badge variant="outline">Checking…</Badge>;
  if (props.isError) return <Badge variant="destructive">API unreachable</Badge>;
  if (props.database === 'up') return <Badge>Database up</Badge>;
  return <Badge variant="destructive">Database down</Badge>;
}

import { Link } from 'react-router';
import { PageWidth } from '@/components/AppShell';
import { EmptyState } from '@/components/States';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <PageWidth>
      <EmptyState
        title="This page doesn't exist"
        action={
          <Button asChild>
            <Link to="/notifications">Go to my notifications</Link>
          </Button>
        }
      >
        The link may be old, or the rule or destination may have been deleted.
      </EmptyState>
    </PageWidth>
  );
}

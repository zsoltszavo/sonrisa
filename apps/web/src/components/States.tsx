import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import { Button } from './ui/button';

export function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-12 text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-4 bg-mist px-6 py-10 sm:px-10">
      <h2 className="text-2xl">{title}</h2>
      <p className="max-w-[60ch]">{children}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 border-l-4 border-destructive bg-white px-6 py-6"
    >
      <h2 className="text-xl">{title}</h2>
      <p>{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A plain `<select>` styled like `Input`: native keyboard and screen-reader behaviour for free,
 * which the admin filters need more than a custom listbox.
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-10 w-full min-w-0 border border-input bg-white px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

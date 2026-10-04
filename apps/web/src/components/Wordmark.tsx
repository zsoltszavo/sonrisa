import { cn } from '@/lib/utils';

/**
 * App lockup modelled on the sonrisa.hu header logo: a lime rounded square with a winking smile,
 * then the wordmark. Drawn here rather than copied, so it scales and stays crisp.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-3 text-forest', className)}>
      <svg viewBox="0 0 40 40" className="size-9 shrink-0 sm:size-11" aria-hidden="true">
        <rect width="40" height="40" rx="7" fill="var(--lime)" />
        <circle cx="14" cy="15" r="2.6" fill="var(--forest)" />
        <path d="M23.5 15.5h6" stroke="var(--forest)" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M11.5 23c2.2 4.4 5.2 6.4 8.5 6.4s6.3-2 8.5-6.4"
          fill="none"
          stroke="var(--forest)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-heading text-[26px] font-semibold tracking-tight sm:text-[32px]">
          sonrisa
        </span>
        <span className="mt-1 text-[13px] text-muted-foreground">world event alerts</span>
      </span>
    </span>
  );
}

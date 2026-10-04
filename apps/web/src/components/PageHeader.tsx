import type { ReactNode } from 'react';

/**
 * The sonrisa.hu "Innovative Solutions" block: a large display title on the left, a short
 * plain-language paragraph beside it on wide screens, and the page's main action.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-10 grid gap-5 border-b border-border pb-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-10">
      <h1 className="text-[34px] sm:text-[44px]">{title}</h1>
      <div className="flex flex-col items-start gap-5 md:pt-2">
        <p className="max-w-[60ch] text-[15px] leading-relaxed">{description}</p>
        {action}
      </div>
    </header>
  );
}

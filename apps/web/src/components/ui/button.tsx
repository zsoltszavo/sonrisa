import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

// sonrisa.hu buttons: square, mint fill with forest text, body (Courier) type, generous padding.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border border-transparent font-sans whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-mint text-forest hover:bg-forest hover:text-mint',
        outline: 'border-mint bg-transparent text-forest hover:bg-mint',
        secondary: 'bg-mist text-forest hover:bg-mint',
        ghost: 'text-forest hover:bg-mist',
        destructive:
          'border-destructive bg-transparent text-destructive hover:bg-destructive hover:text-white',
        link: 'text-forest underline underline-offset-4 hover:decoration-2',
      },
      size: {
        default: 'h-11 gap-2 px-5 text-base',
        xs: "h-7 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-12 min-w-[187px] gap-2 px-6 text-[17px]',
        icon: 'size-10',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

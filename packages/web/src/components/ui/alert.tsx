import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/* Zen DS: callout — вертикальная линия слева семантического цвета, без рамки по кругу и заливки */
const alertVariants = cva(
  "grid gap-0.5 rounded-none border-0 border-l-2 px-4 py-3 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4 group/alert relative w-full",
  {
    variants: {
      variant: {
        default: 'border-border text-card-foreground',
        warning:
          'border-warning text-warning-700 dark:text-warning-300 *:data-[slot=alert-description]:text-warning-700/90 dark:*:data-[slot=alert-description]:text-warning-300/90 *:[svg]:text-warning',
        destructive:
          'border-destructive text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current',
        primary:
          'border-primary text-primary *:data-[slot=alert-description]:text-primary/90 *:[svg]:text-primary',
        success:
          'border-success text-success-700 *:data-[slot=alert-description]:text-success-700/90 *:[svg]:text-success-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'text-sm text-balance md:text-pretty  [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-action"
      className={cn('absolute top-2 right-2', className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };

import React from 'react';

import { cn } from '@/lib/utils';

const inputClass =
  // Zen DS: как input — только подчёркивание
  'grow flex h-9 w-full rounded-none border-0 border-b border-input bg-transparent px-1 py-2 text-sm placeholder:text-muted-foreground focus-within:outline-hidden focus-within:border-foreground disabled:cursor-not-allowed disabled:opacity-50 box-border';

const InputWithIcon = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    icon: React.ReactNode;
  }
>(({ className, ...props }, ref) => (
  <div className={cn(inputClass, className, 'items-center gap-2')}>
    {props.icon}
    <input
      ref={ref}
      className={cn(
        'flex h-full w-full rounded-md bg-transparent text-sm outline-hidden placeholder:text-muted-foreground',
        { 'cursor-not-allowed opacity-50': props.disabled },
      )}
      {...props}
    />
  </div>
));
InputWithIcon.displayName = 'InputWithIcon';

export { InputWithIcon };

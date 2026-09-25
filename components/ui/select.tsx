import * as React from 'react';
import { cn } from '@/lib/utils';

/** Styled native <select> — accessible, works with react-hook-form's register(). */
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-lg border border-input/80 bg-background/45 px-3 py-2 text-sm shadow-sm transition-[border-color,box-shadow,background-color] duration-200',
      'focus-visible:bg-background/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-0',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export { Select };

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[transform,background-color,box-shadow,border-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[0_8px_20px_hsl(var(--primary)/0.2)] hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_10px_24px_hsl(var(--primary)/0.28)]',
        accent: 'bg-accent text-accent-foreground shadow-[0_8px_20px_hsl(var(--accent)/0.18)] hover:-translate-y-0.5 hover:bg-accent/90',
        outline: 'border border-input/80 bg-background/25 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5',
        ghost: 'hover:-translate-y-0.5 hover:bg-secondary',
        destructive: 'bg-destructive text-destructive-foreground shadow-[0_8px_20px_hsl(var(--destructive)/0.18)] hover:bg-destructive/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };

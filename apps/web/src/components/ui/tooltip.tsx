'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TooltipContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TooltipContext = React.createContext<TooltipContextValue | undefined>(undefined);

const TooltipProvider = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

const Tooltip = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = React.useState(false);

  return (
    <TooltipContext.Provider value={{ open, onOpenChange: setOpen }}>
      <div className="relative inline-block">{children}</div>
    </TooltipContext.Provider>
  );
};

const TooltipTrigger = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }
>(({ className, asChild, children, ...props }, ref) => {
  const context = React.useContext(TooltipContext);

  const handleMouseEnter = () => context?.onOpenChange(true);
  const handleMouseLeave = () => context?.onOpenChange(false);
  const handleFocus = () => context?.onOpenChange(true);
  const handleBlur = () => context?.onOpenChange(false);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<{
        onMouseEnter?: () => void;
        onMouseLeave?: () => void;
        onFocus?: () => void;
        onBlur?: () => void;
      }>,
      {
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onFocus: handleFocus,
        onBlur: handleBlur,
      }
    );
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    >
      {children}
    </div>
  );
});
TooltipTrigger.displayName = 'TooltipTrigger';

const TooltipContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const context = React.useContext(TooltipContext);

    if (!context?.open) return null;

    return (
      <div
        ref={ref}
        className={cn(
          'absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
          className
        )}
        {...props}
      />
    );
  }
);
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

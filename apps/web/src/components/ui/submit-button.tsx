'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SubmitButtonProps extends Omit<ButtonProps, 'type'> {
  /** Text to show while submitting */
  pendingText?: string;
  /** Icon to show while submitting */
  pendingIcon?: React.ReactNode;
  /** Children to show when not pending */
  children: React.ReactNode;
}

/**
 * Submit Button with React 19 useFormStatus
 *
 * Automatically shows pending state when the parent form is submitting.
 * Works with both Server Actions and client-side form handlers.
 *
 * @example
 * ```tsx
 * <form action={serverAction}>
 *   <SubmitButton pendingText="Saving...">
 *     Save Changes
 *   </SubmitButton>
 * </form>
 * ```
 */
export function SubmitButton({
  children,
  pendingText,
  pendingIcon = <Loader2 className="mr-2 h-4 w-4 animate-spin" />,
  className,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className={cn(className)}
      aria-disabled={pending || disabled}
      {...props}
    >
      {pending ? (
        <>
          {pendingIcon}
          {pendingText ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/**
 * Hook to check if parent form is submitting
 * Useful for disabling inputs during submission
 */
export function useIsFormPending(): boolean {
  const { pending } = useFormStatus();
  return pending;
}

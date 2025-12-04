'use client';

import { useCallback, useState } from 'react';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'destructive';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
}

let toastIdCounter = 0;

function generateId() {
  return `toast-${++toastIdCounter}`;
}

// Global state for toasts (simple implementation)
const listeners = new Set<() => void>();
let state: ToastState = { toasts: [] };

function getState() {
  return state;
}

function setState(newState: ToastState) {
  state = newState;
  listeners.forEach((listener) => listener());
}

function addToast(toast: Omit<Toast, 'id'>) {
  const id = generateId();
  const newToast = { ...toast, id };

  setState({
    toasts: [...state.toasts, newToast],
  });

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    dismissToast(id);
  }, 5000);

  return id;
}

function dismissToast(id: string) {
  setState({
    toasts: state.toasts.filter((t) => t.id !== id),
  });
}

export function useToast() {
  const [, forceUpdate] = useState({});

  // Subscribe to state changes
  const subscribe = useCallback(() => {
    const listener = () => forceUpdate({});
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  // Ensure we're subscribed
  useState(() => {
    const unsubscribe = subscribe();
    return () => unsubscribe();
  });

  const toast = useCallback((props: Omit<Toast, 'id'>) => {
    return addToast(props);
  }, []);

  const dismiss = useCallback((id: string) => {
    dismissToast(id);
  }, []);

  return {
    toast,
    dismiss,
    toasts: getState().toasts,
  };
}

// Convenience methods
export const toast = {
  success: (title: string, description?: string) =>
    addToast({ title, description, variant: 'success' }),
  error: (title: string, description?: string) =>
    addToast({ title, description, variant: 'error' }),
  warning: (title: string, description?: string) =>
    addToast({ title, description, variant: 'warning' }),
  default: (title: string, description?: string) =>
    addToast({ title, description, variant: 'default' }),
};

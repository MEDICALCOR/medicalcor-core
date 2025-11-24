'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in child component tree and displays a fallback UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error to console in development
    console.error('Error caught by boundary:', error, errorInfo);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // In production, you could send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error, { extra: errorInfo });
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-6">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div className="text-center">
            <h3 className="font-semibold text-destructive">A aparut o eroare</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {this.state.error?.message || 'Ceva nu a functionat corect.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Incearca din nou
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Page-level error boundary with full-page fallback
 */
export class PageErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Page error caught by boundary:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
          <AlertTriangle className="h-16 w-16 text-destructive" />
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-destructive">Eroare de aplicatie</h1>
            <p className="mt-2 text-muted-foreground">
              A aparut o eroare neasteptata. Va rugam sa reincarcati pagina sau sa contactati suportul daca problema persista.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="mt-4 max-h-40 overflow-auto rounded bg-muted p-3 text-left text-xs">
                {this.state.error.stack}
              </pre>
            )}
          </div>
          <div className="flex gap-3">
            <Button onClick={this.handleReload}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reincarcare pagina
            </Button>
            <Button variant="outline" onClick={() => (window.location.href = '/')}>
              Inapoi la pagina principala
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Async error boundary for suspense fallbacks
 * Use with React.Suspense for loading states
 */
export function AsyncBoundary({
  children,
  fallback,
  loadingFallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}): ReactNode {
  return (
    <ErrorBoundary fallback={fallback}>
      {loadingFallback ? (
        <>{children}</>
      ) : (
        children
      )}
    </ErrorBoundary>
  );
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ErrorBoundary, PageErrorBoundary, AsyncBoundary } from '../../components/error-boundary';
import * as Sentry from '@sentry/nextjs';

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(() => 'mock-event-id'),
  showReportDialog: vi.fn(),
}));

// Component that throws an error
function ThrowError({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>No error</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should render children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('should render fallback UI when error is caught', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('A aparut o eroare')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should render custom fallback when provided', () => {
    const customFallback = <div data-testid="custom-fallback">Custom error UI</div>;

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
  });

  it('should call onError callback when error is caught', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error message' }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it('should report error to Sentry', () => {
    render(
      <ErrorBoundary componentName="TestComponent">
        <ThrowError />
      </ErrorBoundary>
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error message' }),
      expect.objectContaining({
        extra: expect.objectContaining({
          componentStack: expect.any(String),
          componentName: 'TestComponent',
        }),
        tags: expect.objectContaining({
          errorBoundary: 'section',
          component: 'TestComponent',
        }),
      })
    );
  });

  it('should include component name in Sentry tags', () => {
    render(
      <ErrorBoundary componentName="UserProfile">
        <ThrowError />
      </ErrorBoundary>
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: expect.objectContaining({
          component: 'UserProfile',
        }),
      })
    );
  });

  it('should recover when retry button is clicked', async () => {
    let shouldThrow = true;

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );

    // Error is shown
    expect(screen.getByText('A aparut o eroare')).toBeInTheDocument();

    // Fix the error condition
    shouldThrow = false;

    // Click retry button
    const retryButton = screen.getByRole('button', { name: /incearca din nou/i });
    retryButton.click();

    // Re-render with fixed error
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );

    // Should show content again
    await waitFor(() => {
      expect(screen.getByText('No error')).toBeInTheDocument();
    });
  });

  it('should display error message in fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should show retry button in default fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByRole('button', { name: /incearca din nou/i })).toBeInTheDocument();
  });
});

describe('PageErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should render children when no error occurs', () => {
    render(
      <PageErrorBoundary>
        <div data-testid="child">Page content</div>
      </PageErrorBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('should render full-page error UI when error is caught', () => {
    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>
    );

    expect(screen.getByText('Eroare de aplicatie')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should render custom fallback when provided', () => {
    const customFallback = <div data-testid="custom-page-fallback">Custom page error</div>;

    render(
      <PageErrorBoundary fallback={customFallback}>
        <ThrowError />
      </PageErrorBoundary>
    );

    expect(screen.getByTestId('custom-page-fallback')).toBeInTheDocument();
  });

  it('should report error to Sentry with page context', () => {
    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({
          errorBoundary: 'page',
          severity: 'critical',
        }),
      })
    );
  });

  it('should display event ID when available', () => {
    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>
    );

    expect(screen.getByText(/ID Eroare:/i)).toBeInTheDocument();
    expect(screen.getByText('mock-event-id')).toBeInTheDocument();
  });

  it('should show error stack in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>
    );

    const stackElement = screen.getByText(/Test error message/i).closest('pre');
    expect(stackElement).toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('should show reload button', () => {
    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>
    );

    expect(screen.getByRole('button', { name: /reincarcare pagina/i })).toBeInTheDocument();
  });

  it('should show home button', () => {
    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>
    );

    expect(screen.getByRole('button', { name: /inapoi la pagina principala/i })).toBeInTheDocument();
  });

  it('should show report feedback button when event ID exists', () => {
    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>
    );

    expect(screen.getByRole('button', { name: /raporteaza problema/i })).toBeInTheDocument();
  });

  it('should call Sentry.showReportDialog when report button is clicked', () => {
    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>
    );

    const reportButton = screen.getByRole('button', { name: /raporteaza problema/i });
    reportButton.click();

    expect(Sentry.showReportDialog).toHaveBeenCalledWith({ eventId: 'mock-event-id' });
  });

  it('should call onError callback when provided', () => {
    const onError = vi.fn();

    render(
      <PageErrorBoundary onError={onError}>
        <ThrowError />
      </PageErrorBoundary>
    );

    expect(onError).toHaveBeenCalled();
  });
});

describe('AsyncBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should render children when no error occurs', () => {
    render(
      <AsyncBoundary>
        <div data-testid="async-child">Async content</div>
      </AsyncBoundary>
    );

    expect(screen.getByTestId('async-child')).toBeInTheDocument();
  });

  it('should catch errors like ErrorBoundary', () => {
    render(
      <AsyncBoundary>
        <ThrowError />
      </AsyncBoundary>
    );

    expect(screen.getByText('A aparut o eroare')).toBeInTheDocument();
  });

  it('should render custom fallback when provided', () => {
    const customFallback = <div data-testid="async-fallback">Async error</div>;

    render(
      <AsyncBoundary fallback={customFallback}>
        <ThrowError />
      </AsyncBoundary>
    );

    expect(screen.getByTestId('async-fallback')).toBeInTheDocument();
  });

  it('should render children when loadingFallback is provided', () => {
    const loadingFallback = <div data-testid="loading">Loading...</div>;

    render(
      <AsyncBoundary loadingFallback={loadingFallback}>
        <div data-testid="content">Content</div>
      </AsyncBoundary>
    );

    expect(screen.getByTestId('content')).toBeInTheDocument();
  });
});

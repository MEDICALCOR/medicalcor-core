/**
 * Custom render function that wraps components with all necessary providers.
 * Use this instead of @testing-library/react's render for component tests.
 */
import React, { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create a new QueryClient for each test to avoid shared state
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Don't retry failed queries in tests
        gcTime: 0, // Garbage collect immediately
        staleTime: 0, // Always consider data stale
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface TestProviderProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

/**
 * Provider wrapper with all app providers for testing
 */
function TestProviders({ children, queryClient }: TestProviderProps): ReactElement {
  const client = queryClient ?? createTestQueryClient();

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

/**
 * Custom render function that wraps the component with test providers.
 *
 * @example
 * ```tsx
 * import { renderWithProviders, screen } from '@/__tests__/setup/render';
 *
 * test('renders component', () => {
 *   renderWithProviders(<MyComponent />);
 *   expect(screen.getByText('Hello')).toBeInTheDocument();
 * });
 * ```
 */
function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): RenderResult & { queryClient: QueryClient } {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options;

  const Wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <TestProviders queryClient={queryClient}>{children}</TestProviders>
  );

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { renderWithProviders, createTestQueryClient, TestProviders };

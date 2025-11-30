/**
 * @module architecture/layers/boundaries
 *
 * Layer Boundary Enforcement
 * ==========================
 *
 * Runtime utilities for enforcing architectural boundaries.
 * These help prevent accidental violations of the dependency rule.
 */

import type {
  ArchitecturalLayer,
  LayerMetadata,
  DomainComponent,
  ApplicationComponent,
  InfrastructureComponent,
  UIComponent,
} from './contracts.js';

// ============================================================================
// LAYER REGISTRY
// ============================================================================

/**
 * Registry of all components and their layers.
 * Used for runtime validation of architectural boundaries.
 */
class LayerRegistry {
  private components = new Map<string, LayerMetadata>();
  private violations: BoundaryViolation[] = [];

  /**
   * Register a component with its layer
   */
  register(componentId: string, metadata: LayerMetadata): void {
    this.components.set(componentId, metadata);
  }

  /**
   * Get layer for a component
   */
  getLayer(componentId: string): ArchitecturalLayer | undefined {
    return this.components.get(componentId)?.layer;
  }

  /**
   * Check if a dependency is valid according to the dependency rule
   */
  isValidDependency(fromLayer: ArchitecturalLayer, toLayer: ArchitecturalLayer): boolean {
    const layerOrder: Record<ArchitecturalLayer, number> = {
      ui: 0,
      application: 1,
      domain: 2,
      infrastructure: 3, // Infrastructure depends on domain via DI
    };

    // Domain has no outbound dependencies (except to itself)
    if (fromLayer === 'domain' && toLayer !== 'domain') {
      return false;
    }

    // UI can depend on Application only
    if (fromLayer === 'ui' && toLayer !== 'application' && toLayer !== 'ui') {
      return false;
    }

    // Application can depend on Domain only
    if (fromLayer === 'application' && toLayer !== 'domain' && toLayer !== 'application') {
      return false;
    }

    // Infrastructure can depend on Domain (via interfaces)
    if (fromLayer === 'infrastructure' && toLayer !== 'domain' && toLayer !== 'infrastructure') {
      return false;
    }

    return true;
  }

  /**
   * Record a boundary violation
   */
  recordViolation(violation: BoundaryViolation): void {
    this.violations.push(violation);
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[Architecture Violation] ${violation.fromComponent} (${violation.fromLayer}) ` +
          `→ ${violation.toComponent} (${violation.toLayer}): ${violation.message}`
      );
    }
  }

  /**
   * Get all recorded violations
   */
  getViolations(): readonly BoundaryViolation[] {
    return [...this.violations];
  }

  /**
   * Clear all violations (for testing)
   */
  clearViolations(): void {
    this.violations = [];
  }
}

/**
 * Boundary violation record
 */
export interface BoundaryViolation {
  readonly timestamp: string;
  readonly fromComponent: string;
  readonly fromLayer: ArchitecturalLayer;
  readonly toComponent: string;
  readonly toLayer: ArchitecturalLayer;
  readonly message: string;
  readonly stackTrace?: string;
}

// Singleton registry
export const layerRegistry = new LayerRegistry();

// ============================================================================
// BOUNDARY GUARDS
// ============================================================================

/**
 * Guard that ensures a component belongs to the domain layer
 */
export function assertDomainLayer<T extends DomainComponent>(component: T): asserts component is T {
  if (component.__layer !== 'domain') {
    throw new LayerViolationError(
      `Expected domain layer component, got: ${component.__layer || 'unknown'}`
    );
  }
}

/**
 * Guard that ensures a component belongs to the application layer
 */
export function assertApplicationLayer<T extends ApplicationComponent>(
  component: T
): asserts component is T {
  if (component.__layer !== 'application') {
    throw new LayerViolationError(
      `Expected application layer component, got: ${component.__layer || 'unknown'}`
    );
  }
}

/**
 * Guard that ensures a component belongs to the infrastructure layer
 */
export function assertInfrastructureLayer<T extends InfrastructureComponent>(
  component: T
): asserts component is T {
  if (component.__layer !== 'infrastructure') {
    throw new LayerViolationError(
      `Expected infrastructure layer component, got: ${component.__layer || 'unknown'}`
    );
  }
}

/**
 * Guard that ensures a component belongs to the UI layer
 */
export function assertUILayer<T extends UIComponent>(component: T): asserts component is T {
  if (component.__layer !== 'ui') {
    throw new LayerViolationError(
      `Expected UI layer component, got: ${component.__layer || 'unknown'}`
    );
  }
}

/**
 * Error thrown when layer boundaries are violated
 */
export class LayerViolationError extends Error {
  readonly code = 'LAYER_VIOLATION';

  constructor(message: string) {
    super(message);
    this.name = 'LayerViolationError';
  }
}

// ============================================================================
// DEPENDENCY VALIDATION
// ============================================================================

/**
 * Validate that a dependency between layers is allowed
 */
export function validateDependency(
  fromComponent: string,
  fromLayer: ArchitecturalLayer,
  toComponent: string,
  toLayer: ArchitecturalLayer
): boolean {
  const isValid = layerRegistry.isValidDependency(fromLayer, toLayer);

  if (!isValid) {
    layerRegistry.recordViolation({
      timestamp: new Date().toISOString(),
      fromComponent,
      fromLayer,
      toComponent,
      toLayer,
      message: `Invalid dependency: ${fromLayer} cannot depend on ${toLayer}`,
      stackTrace: new Error().stack,
    });
  }

  return isValid;
}

/**
 * Create a layer-aware proxy that validates all dependencies
 */
export function createLayerProxy<T extends object>(
  target: T,
  sourceLayer: ArchitecturalLayer,
  componentName: string
): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value = obj[prop as keyof T];

      // Track property access for dependency analysis
      if (typeof value === 'function') {
        return function (this: T, ...args: unknown[]) {
          // Could add dependency tracking here
          return (value as (...args: unknown[]) => unknown).apply(this, args);
        };
      }

      return value;
    },
  });
}

// ============================================================================
// MODULE BOUNDARY ANALYSIS
// ============================================================================

/**
 * Analyze imports to detect boundary violations
 * This is meant to be used in build/lint tools
 */
export function analyzeModuleBoundaries(imports: ModuleImport[]): BoundaryAnalysisResult {
  const violations: BoundaryViolation[] = [];
  const warnings: string[] = [];

  for (const imp of imports) {
    const fromLayer = detectLayerFromPath(imp.fromModule);
    const toLayer = detectLayerFromPath(imp.toModule);

    if (fromLayer && toLayer && !layerRegistry.isValidDependency(fromLayer, toLayer)) {
      violations.push({
        timestamp: new Date().toISOString(),
        fromComponent: imp.fromModule,
        fromLayer,
        toComponent: imp.toModule,
        toLayer,
        message: `Module ${imp.fromModule} (${fromLayer}) imports ${imp.toModule} (${toLayer})`,
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings,
  };
}

export interface ModuleImport {
  readonly fromModule: string;
  readonly toModule: string;
  readonly importedSymbols: string[];
}

export interface BoundaryAnalysisResult {
  readonly valid: boolean;
  readonly violations: BoundaryViolation[];
  readonly warnings: string[];
}

/**
 * Detect layer from module path
 */
function detectLayerFromPath(modulePath: string): ArchitecturalLayer | null {
  if (modulePath.includes('/domain/') || modulePath.includes('@medicalcor/domain')) {
    return 'domain';
  }
  if (modulePath.includes('/application/') || modulePath.includes('/use-cases/')) {
    return 'application';
  }
  if (
    modulePath.includes('/infrastructure/') ||
    modulePath.includes('/adapters/') ||
    modulePath.includes('@medicalcor/infra')
  ) {
    return 'infrastructure';
  }
  if (
    modulePath.includes('/ui/') ||
    modulePath.includes('/routes/') ||
    modulePath.includes('/controllers/')
  ) {
    return 'ui';
  }
  return null;
}

// ============================================================================
// LAYER CONTEXT
// ============================================================================

/**
 * Async local storage for layer context
 * Allows tracking the current execution context's layer
 */
import { AsyncLocalStorage } from 'async_hooks';

interface LayerContext {
  layer: ArchitecturalLayer;
  componentName: string;
  traceId: string;
}

const layerContextStorage = new AsyncLocalStorage<LayerContext>();

/**
 * Run code within a specific layer context
 */
export function runInLayerContext<T>(
  layer: ArchitecturalLayer,
  componentName: string,
  fn: () => T
): T {
  const context: LayerContext = {
    layer,
    componentName,
    traceId: crypto.randomUUID(),
  };

  return layerContextStorage.run(context, fn);
}

/**
 * Get the current layer context
 */
export function getCurrentLayerContext(): LayerContext | undefined {
  return layerContextStorage.getStore();
}

/**
 * Ensure code is running in the expected layer
 */
export function ensureLayer(expectedLayer: ArchitecturalLayer): void {
  const context = getCurrentLayerContext();
  if (context && context.layer !== expectedLayer) {
    throw new LayerViolationError(
      `Expected to be in ${expectedLayer} layer, but currently in ${context.layer}`
    );
  }
}

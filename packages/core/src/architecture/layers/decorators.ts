/**
 * @module architecture/layers/decorators
 *
 * Layer Decorators
 * ================
 *
 * TypeScript decorators for marking and enforcing layer membership.
 * These provide compile-time documentation and runtime validation.
 */

import type { ArchitecturalLayer, LayerMetadata } from './contracts.js';
import { layerRegistry, validateDependency, LayerViolationError } from './boundaries.js';

// ============================================================================
// LAYER DECORATORS
// ============================================================================

/**
 * Marks a class as belonging to the Domain layer
 * Domain classes should have NO external dependencies
 */
export function DomainLayer(moduleName = 'unknown') {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    const metadata: LayerMetadata = {
      layer: 'domain',
      module: moduleName,
      version: '1.0.0',
    };

    layerRegistry.register(constructor.name, metadata);

    // Add layer marker to prototype
    Object.defineProperty(constructor.prototype, '__layer', {
      value: 'domain',
      writable: false,
      enumerable: false,
    });

    return constructor;
  };
}

/**
 * Marks a class as belonging to the Application layer
 * Application classes can depend on Domain layer only
 */
export function ApplicationLayer(moduleName = 'unknown') {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    const metadata: LayerMetadata = {
      layer: 'application',
      module: moduleName,
      version: '1.0.0',
    };

    layerRegistry.register(constructor.name, metadata);

    Object.defineProperty(constructor.prototype, '__layer', {
      value: 'application',
      writable: false,
      enumerable: false,
    });

    return constructor;
  };
}

/**
 * Marks a class as belonging to the Infrastructure layer
 * Infrastructure classes implement Domain interfaces
 */
export function InfrastructureLayer(moduleName = 'unknown') {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    const metadata: LayerMetadata = {
      layer: 'infrastructure',
      module: moduleName,
      version: '1.0.0',
    };

    layerRegistry.register(constructor.name, metadata);

    Object.defineProperty(constructor.prototype, '__layer', {
      value: 'infrastructure',
      writable: false,
      enumerable: false,
    });

    return constructor;
  };
}

/**
 * Marks a class as belonging to the UI layer
 * UI classes can depend on Application layer only
 */
export function UILayer(moduleName = 'unknown') {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    const metadata: LayerMetadata = {
      layer: 'ui',
      module: moduleName,
      version: '1.0.0',
    };

    layerRegistry.register(constructor.name, metadata);

    Object.defineProperty(constructor.prototype, '__layer', {
      value: 'ui',
      writable: false,
      enumerable: false,
    });

    return constructor;
  };
}

// ============================================================================
// DEPENDENCY DECORATORS
// ============================================================================

/**
 * Marks a dependency as injected from another layer
 * Validates that the dependency direction is correct
 */
export function InjectFromLayer(sourceLayer: ArchitecturalLayer) {
  return function (target: object, propertyKey: string | symbol, _parameterIndex?: number): void {
    const targetLayer = (target as { __layer?: ArchitecturalLayer }).__layer;

    if (targetLayer) {
      const isValid = validateDependency(
        target.constructor.name,
        targetLayer,
        String(propertyKey),
        sourceLayer
      );

      if (!isValid && process.env.NODE_ENV !== 'production') {
        console.warn(
          `[Architecture Warning] Suspicious dependency injection in ${target.constructor.name}: ` +
            `injecting ${sourceLayer} layer component into ${targetLayer} layer`
        );
      }
    }
  };
}

/**
 * Marks a method as a cross-layer boundary
 * Useful for documenting intentional layer crossings (like ports)
 */
export function LayerBoundary(
  fromLayer: ArchitecturalLayer,
  toLayer: ArchitecturalLayer,
  description?: string
) {
  return function (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      // Log boundary crossing in development
      if (process.env.NODE_ENV !== 'production') {
        console.debug(
          `[Layer Boundary] ${String(propertyKey)}: ${fromLayer} → ${toLayer}${description ? ` (${description})` : ''}`
        );
      }

      return original.apply(this, args);
    };

    return descriptor;
  };
}

// ============================================================================
// COMPONENT TYPE DECORATORS
// ============================================================================

/**
 * Marks a class as an Aggregate Root
 */
export function AggregateRootDecorator(aggregateType: string) {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    Object.defineProperty(constructor.prototype, '__aggregateType', {
      value: aggregateType,
      writable: false,
      enumerable: false,
    });

    return DomainLayer(aggregateType)(constructor);
  };
}

/**
 * Marks a class as a Value Object
 */
export function ValueObjectDecorator(valueObjectType: string) {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    Object.defineProperty(constructor.prototype, '__valueObjectType', {
      value: valueObjectType,
      writable: false,
      enumerable: false,
    });

    // Freeze instances to ensure immutability
    const original = constructor;
    // @ts-expect-error - Mixin pattern requires any[] constructor
    const decorated = class extends original {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(...args: any[]) {
        super(...args);
        Object.freeze(this);
      }
    };

    return DomainLayer(valueObjectType)(decorated as unknown as T);
  };
}

/**
 * Marks a class as a Domain Event
 */
export function DomainEventDecorator(eventType: string) {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    Object.defineProperty(constructor.prototype, '__eventType', {
      value: eventType,
      writable: false,
      enumerable: false,
    });

    return DomainLayer(eventType)(constructor);
  };
}

/**
 * Marks a class as a Command Handler
 */
export function CommandHandlerDecorator(commandType: string) {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    Object.defineProperty(constructor.prototype, '__commandType', {
      value: commandType,
      writable: false,
      enumerable: false,
    });

    return ApplicationLayer(commandType)(constructor);
  };
}

/**
 * Marks a class as a Query Handler
 */
export function QueryHandlerDecorator(queryType: string) {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    Object.defineProperty(constructor.prototype, '__queryType', {
      value: queryType,
      writable: false,
      enumerable: false,
    });

    return ApplicationLayer(queryType)(constructor);
  };
}

/**
 * Marks a class as a Use Case
 */
export function UseCaseDecorator(useCaseName: string) {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    Object.defineProperty(constructor.prototype, '__useCaseName', {
      value: useCaseName,
      writable: false,
      enumerable: false,
    });

    return ApplicationLayer(useCaseName)(constructor);
  };
}

/**
 * Marks a class as a Repository implementation
 */
export function RepositoryImplementation(repositoryInterface: string) {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    Object.defineProperty(constructor.prototype, '__implementsRepository', {
      value: repositoryInterface,
      writable: false,
      enumerable: false,
    });

    return InfrastructureLayer(repositoryInterface)(constructor);
  };
}

/**
 * Marks a class as an Adapter
 */
export function AdapterDecorator(portName: string, adapterType: 'inbound' | 'outbound') {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    Object.defineProperty(constructor.prototype, '__portName', {
      value: portName,
      writable: false,
      enumerable: false,
    });

    Object.defineProperty(constructor.prototype, '__adapterType', {
      value: adapterType,
      writable: false,
      enumerable: false,
    });

    return InfrastructureLayer(portName)(constructor);
  };
}

// ============================================================================
// VALIDATION DECORATORS
// ============================================================================

/**
 * Ensures method is only called from allowed layers
 */
export function AllowedCallers(...layers: ArchitecturalLayer[]) {
  return function (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      // In production, skip validation for performance
      if (process.env.NODE_ENV === 'production') {
        return original.apply(this, args);
      }

      // Get caller info from stack trace (simplified)
      const stack = new Error().stack ?? '';
      const callerInfo = stack.split('\n')[2] ?? '';

      // Check if caller is from an allowed layer
      let callerLayer: ArchitecturalLayer | null = null;
      if (callerInfo.includes('/domain/')) callerLayer = 'domain';
      else if (callerInfo.includes('/application/')) callerLayer = 'application';
      else if (callerInfo.includes('/infrastructure/')) callerLayer = 'infrastructure';
      else if (callerInfo.includes('/ui/') || callerInfo.includes('/routes/')) callerLayer = 'ui';

      if (callerLayer && !layers.includes(callerLayer)) {
        throw new LayerViolationError(
          `Method ${String(propertyKey)} can only be called from layers: ${layers.join(', ')}. ` +
            `Called from: ${callerLayer}`
        );
      }

      return original.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Marks a method as internal to the layer (cannot be called from outside)
 */
export function LayerInternal() {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const targetLayer = (target as { __layer?: ArchitecturalLayer }).__layer;

    if (targetLayer) {
      return AllowedCallers(targetLayer)(target, propertyKey, descriptor);
    }

    return descriptor;
  };
}

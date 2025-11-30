/**
 * @module architecture/layers
 *
 * Layer Contracts & Boundaries
 * ============================
 *
 * Defines strict contracts for each architectural layer.
 * These contracts enforce the dependency rule: dependencies point inward.
 *
 * Dependency Direction:
 * UI → Application → Domain ← Infrastructure
 *
 * The Domain layer is at the center and has NO dependencies on other layers.
 * Infrastructure adapts to Domain interfaces (Dependency Inversion).
 */

export * from './contracts.js';
export * from './boundaries.js';
export * from './decorators.js';

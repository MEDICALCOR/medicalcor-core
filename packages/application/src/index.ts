/**
 * @fileoverview Application Layer Package
 *
 * Hexagonal Architecture Application Layer for MedicalCor OSAX.
 *
 * This package contains:
 * - **Primary Ports**: Interfaces that define what the application offers (driving side)
 * - **Secondary Ports**: Interfaces that define what the application needs (driven side)
 * - **Use Cases**: Application service implementations
 * - **Security**: Authentication, authorization, and audit context
 *
 * @module @medicalcor/application
 *
 * ## Architecture Overview
 *
 * ```
 *                    ┌─────────────────────────────────────────┐
 *                    │            APPLICATION LAYER            │
 *                    │                                         │
 *   ┌──────────┐     │  ┌─────────────┐    ┌──────────────┐   │     ┌──────────┐
 *   │   REST   │────▶│  │   Primary   │───▶│   Use Cases  │   │────▶│ Database │
 *   │Controller│     │  │    Ports    │    │              │   │     │ Adapter  │
 *   └──────────┘     │  └─────────────┘    └──────┬───────┘   │     └──────────┘
 *                    │                            │           │
 *   ┌──────────┐     │                            │           │     ┌──────────┐
 *   │   CLI    │────▶│                            ▼           │────▶│  Event   │
 *   │  Adapter │     │                     ┌──────────────┐   │     │  Queue   │
 *   └──────────┘     │                     │  Secondary   │   │     └──────────┘
 *                    │                     │    Ports     │   │
 *                    │                     └──────────────┘   │     ┌──────────┐
 *                    │                                        │────▶│  Audit   │
 *                    └────────────────────────────────────────┘     │  Service │
 *                                                                    └──────────┘
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import {
 *   // Primary Ports
 *   OsaxCaseService,
 *   CreateCaseRequest,
 *
 *   // Secondary Ports
 *   OsaxCaseRepository,
 *   EventPublisher,
 *   AuditService,
 *
 *   // Use Cases
 *   CreateOsaxCaseUseCase,
 *
 *   // Security
 *   SecurityContext,
 *   Permission,
 *   Role,
 *
 *   // Shared
 *   Result,
 *   Ok,
 *   Err,
 *   DomainError,
 * } from '@medicalcor/application';
 * ```
 */

// ============================================================================
// PRIMARY PORTS (Driving Side)
// ============================================================================

export * from './ports/primary/index.js';

// ============================================================================
// SECONDARY PORTS (Driven Side)
// ============================================================================

export * from './ports/secondary/index.js';

// ============================================================================
// USE CASES
// ============================================================================

export * from './use-cases/index.js';

// ============================================================================
// SECURITY
// ============================================================================

export * from './security/index.js';

// ============================================================================
// SHARED TYPES & UTILITIES
// ============================================================================

export * from './shared/index.js';

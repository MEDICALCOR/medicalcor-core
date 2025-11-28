/**
 * @medicalcor/domain - State-of-the-Art Domain Layer
 *
 * This package provides the comprehensive domain layer for dental clinic management with:
 *
 * **Consent Module** - GDPR-compliant consent management
 * - Full audit trail for compliance
 * - Policy versioning support
 * - Automatic expiration handling
 * - Data export and erasure (GDPR rights)
 *
 * **Language Module** - Multi-language detection and management
 * - Rule-based language detection (RO, EN, DE)
 * - User preference management
 * - Localized templates with variable substitution
 * - Medical term extraction
 *
 * **Scheduling Module** - Transaction-safe appointment management
 * - GDPR/HIPAA compliant consent verification
 * - Row-level locking to prevent race conditions
 * - Secure confirmation code generation
 * - Result types for explicit error handling
 *
 * **Scoring Module** - AI-powered lead qualification
 * - GPT-4o integration for intelligent scoring
 * - Rule-based fallback for reliability
 * - Zod schema validation for type safety
 *
 * **Triage Module** - Intelligent lead routing
 * - Priority scheduling based on patient needs
 * - Team assignment based on procedure interest
 * - Safety disclaimers for priority cases
 *
 * Architecture Highlights:
 * - Branded types for compile-time safety
 * - Result types for explicit error handling
 * - Const assertions for exhaustive type checking
 * - Immutable data structures throughout
 * - Repository pattern with dependency injection
 *
 * @module domain
 */

// Domain types - shared foundation
export * from './types.js';

// Domain modules
export * from './scoring/index.js';
export * from './triage/index.js';
export * from './scheduling/index.js';
export * from './consent/index.js';
export * from './language/index.js';

-- ============================================================================
-- MedicalCor Core - Foreign Key Constraints Enhancement
-- ============================================================================
-- Task: [M3] Foreign Key Constraints Minimal
-- Adds missing FK constraints for critical references while documenting
-- CQRS eventual consistency pattern for polymorphic references.
-- ============================================================================

-- =============================================================================
-- CASES TABLE - Add clinic_id FK and audit column FKs
-- =============================================================================
-- cases.clinic_id should reference clinics to ensure data integrity

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'cases_clinic_fk' AND table_name = 'cases'
    ) THEN
        -- First, clean up any orphaned clinic_id references
        UPDATE cases
        SET clinic_id = NULL
        WHERE clinic_id IS NOT NULL
        AND clinic_id NOT IN (SELECT id FROM clinics);

        ALTER TABLE cases ADD CONSTRAINT cases_clinic_fk
            FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'cases_created_by_fk' AND table_name = 'cases'
    ) THEN
        -- Clean up orphaned created_by references
        UPDATE cases
        SET created_by = NULL
        WHERE created_by IS NOT NULL
        AND created_by NOT IN (SELECT id FROM users);

        ALTER TABLE cases ADD CONSTRAINT cases_created_by_fk
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'cases_updated_by_fk' AND table_name = 'cases'
    ) THEN
        -- Clean up orphaned updated_by references
        UPDATE cases
        SET updated_by = NULL
        WHERE updated_by IS NOT NULL
        AND updated_by NOT IN (SELECT id FROM users);

        ALTER TABLE cases ADD CONSTRAINT cases_updated_by_fk
            FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =============================================================================
-- PAYMENTS TABLE - Add clinic_id FK and audit column FKs
-- =============================================================================
-- payments.clinic_id should reference clinics for multi-tenant isolation

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'payments_clinic_fk' AND table_name = 'payments'
    ) THEN
        -- Clean up orphaned clinic_id references
        UPDATE payments
        SET clinic_id = (
            SELECT c.clinic_id FROM cases c WHERE c.id = payments.case_id
        )
        WHERE clinic_id NOT IN (SELECT id FROM clinics);

        ALTER TABLE payments ADD CONSTRAINT payments_clinic_fk
            FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'payments_received_by_fk' AND table_name = 'payments'
    ) THEN
        -- Clean up orphaned received_by references
        UPDATE payments
        SET received_by = NULL
        WHERE received_by IS NOT NULL
        AND received_by NOT IN (SELECT id FROM users);

        ALTER TABLE payments ADD CONSTRAINT payments_received_by_fk
            FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'payments_created_by_fk' AND table_name = 'payments'
    ) THEN
        -- Clean up orphaned created_by references
        UPDATE payments
        SET created_by = NULL
        WHERE created_by IS NOT NULL
        AND created_by NOT IN (SELECT id FROM users);

        ALTER TABLE payments ADD CONSTRAINT payments_created_by_fk
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =============================================================================
-- LEADS TABLE - Add audit column FKs
-- =============================================================================
-- leads.created_by and updated_by should reference users

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'leads_created_by_fk' AND table_name = 'leads'
    ) THEN
        -- Clean up orphaned created_by references
        UPDATE leads
        SET created_by = NULL
        WHERE created_by IS NOT NULL
        AND created_by NOT IN (SELECT id FROM users);

        ALTER TABLE leads ADD CONSTRAINT leads_created_by_fk
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'leads_updated_by_fk' AND table_name = 'leads'
    ) THEN
        -- Clean up orphaned updated_by references
        UPDATE leads
        SET updated_by = NULL
        WHERE updated_by IS NOT NULL
        AND updated_by NOT IN (SELECT id FROM users);

        ALTER TABLE leads ADD CONSTRAINT leads_updated_by_fk
            FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =============================================================================
-- EPISODIC_EVENTS TABLE - Document polymorphic reference pattern
-- =============================================================================
-- NOTE: episodic_events.subject_id uses a POLYMORPHIC REFERENCE pattern
-- (subject_type + subject_id) which cannot have a traditional FK constraint.
-- This is intentional for the CQRS/Event Sourcing architecture.
--
-- The subject_id can reference:
--   - leads(id) when subject_type = 'lead'
--   - patients(id) when subject_type = 'patient' (future)
--   - contacts(id) when subject_type = 'contact' (future)
--
-- Integrity is enforced at the application layer via:
--   1. Zod schema validation (packages/core/src/cognitive/types.ts)
--   2. EpisodeBuilder service (packages/core/src/cognitive/episode-builder.ts)
--   3. GDPR erasure service (packages/core/src/cognitive/gdpr-erasure.ts)
--
-- See ADR-004 for the full architecture documentation.

COMMENT ON COLUMN episodic_events.subject_id IS
    'Polymorphic reference to subject entity. Type determined by subject_type column. '
    'FK not enforced at DB level due to polymorphic nature. '
    'Integrity enforced at application layer (see ADR-004).';

COMMENT ON COLUMN episodic_events.subject_type IS
    'Discriminator for polymorphic subject_id. Valid values: lead, patient, contact. '
    'Combined with subject_id to determine target entity.';

-- =============================================================================
-- BEHAVIORAL_PATTERNS TABLE - Document polymorphic reference pattern
-- =============================================================================
-- Same polymorphic pattern as episodic_events

COMMENT ON COLUMN behavioral_patterns.subject_id IS
    'Polymorphic reference to subject entity. Type determined by subject_type column. '
    'FK not enforced at DB level due to polymorphic nature. '
    'Integrity enforced at application layer (see ADR-004).';

COMMENT ON COLUMN behavioral_patterns.subject_type IS
    'Discriminator for polymorphic subject_id. Valid values: lead, patient, contact. '
    'Combined with subject_id to determine target entity.';

-- =============================================================================
-- DOMAIN_EVENTS TABLE - Document event sourcing pattern
-- =============================================================================
-- domain_events is an append-only event store following CQRS/ES patterns
-- Referential integrity is handled via eventual consistency

COMMENT ON TABLE domain_events IS
    'Append-only event store for CQRS/Event Sourcing. '
    'Events reference entities via correlation_id and payload. '
    'FK constraints not applied to maintain append-only semantics and performance. '
    'Eventual consistency enforced via event handlers in Trigger.dev.';

-- =============================================================================
-- Verification Query (for manual testing)
-- =============================================================================
-- Run this query to verify all FK constraints after migration:
--
-- SELECT
--     tc.table_name,
--     kcu.column_name,
--     ccu.table_name AS foreign_table_name,
--     ccu.column_name AS foreign_column_name,
--     tc.constraint_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--     ON tc.constraint_name = kcu.constraint_name
--     AND tc.table_schema = kcu.table_schema
-- JOIN information_schema.constraint_column_usage AS ccu
--     ON ccu.constraint_name = tc.constraint_name
--     AND ccu.table_schema = tc.table_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY'
-- ORDER BY tc.table_name, kcu.column_name;

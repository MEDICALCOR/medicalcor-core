-- ============================================================================
-- MedicalCor Core - Knowledge Graph Row Level Security Policies
-- ============================================================================
-- Enables multi-tenant data isolation for knowledge graph tables to ensure
-- HIPAA/GDPR compliance at the database level. This extends the cognitive
-- memory RLS to cover the complete knowledge graph subsystem.
-- ============================================================================

-- =============================================================================
-- ADD clinic_id COLUMN FOR MULTI-TENANT ISOLATION
-- =============================================================================

-- Add clinic_id to knowledge_entities for direct tenant filtering
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_entities' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE knowledge_entities ADD COLUMN clinic_id UUID;
        CREATE INDEX IF NOT EXISTS idx_knowledge_entities_clinic_id ON knowledge_entities(clinic_id)
            WHERE deleted_at IS NULL;
        COMMENT ON COLUMN knowledge_entities.clinic_id IS 'Clinic ID for multi-tenant data isolation (RLS)';
    END IF;
END $$;

-- Add clinic_id to knowledge_relations for direct tenant filtering
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_relations' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE knowledge_relations ADD COLUMN clinic_id UUID;
        CREATE INDEX IF NOT EXISTS idx_knowledge_relations_clinic_id ON knowledge_relations(clinic_id);
        COMMENT ON COLUMN knowledge_relations.clinic_id IS 'Clinic ID for multi-tenant data isolation (RLS)';
    END IF;
END $$;

-- Add clinic_id to entity_event_mapping for direct tenant filtering
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'entity_event_mapping' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE entity_event_mapping ADD COLUMN clinic_id UUID;
        CREATE INDEX IF NOT EXISTS idx_entity_event_mapping_clinic_id ON entity_event_mapping(clinic_id);
        COMMENT ON COLUMN entity_event_mapping.clinic_id IS 'Clinic ID for multi-tenant data isolation (RLS)';
    END IF;
END $$;

-- =============================================================================
-- BACKFILL clinic_id FROM EPISODIC_EVENTS AND KNOWLEDGE_ENTITIES
-- =============================================================================
-- This populates clinic_id for existing knowledge graph data by looking up
-- the clinic from related episodic events.

DO $$
BEGIN
    -- Backfill entity_event_mapping from episodic_events
    UPDATE entity_event_mapping eem
    SET clinic_id = ee.clinic_id
    FROM episodic_events ee
    WHERE eem.event_id = ee.id
      AND eem.clinic_id IS NULL
      AND ee.clinic_id IS NOT NULL;

    -- Backfill knowledge_entities from entity_event_mapping (use the most common clinic_id)
    -- Or from first_mentioned_event_id if available
    UPDATE knowledge_entities ke
    SET clinic_id = COALESCE(
        (SELECT ee.clinic_id FROM episodic_events ee WHERE ee.id = ke.first_mentioned_event_id),
        (SELECT eem.clinic_id FROM entity_event_mapping eem WHERE eem.entity_id = ke.id AND eem.clinic_id IS NOT NULL LIMIT 1)
    )
    WHERE ke.clinic_id IS NULL;

    -- Backfill knowledge_relations from source entity's clinic_id
    UPDATE knowledge_relations kr
    SET clinic_id = ke.clinic_id
    FROM knowledge_entities ke
    WHERE kr.source_entity_id = ke.id
      AND kr.clinic_id IS NULL
      AND ke.clinic_id IS NOT NULL;
END $$;

-- =============================================================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE knowledge_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_event_mapping ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too (defense in depth)
ALTER TABLE knowledge_entities FORCE ROW LEVEL SECURITY;
ALTER TABLE knowledge_relations FORCE ROW LEVEL SECURITY;
ALTER TABLE entity_event_mapping FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES FOR KNOWLEDGE_ENTITIES
-- =============================================================================
-- Access patterns:
-- 1. System users (Trigger.dev workflows, admin) - full access
-- 2. Clinic users - access only their clinic's data

-- Policy: System and admin users have full access
DROP POLICY IF EXISTS knowledge_entities_system_access ON knowledge_entities;
CREATE POLICY knowledge_entities_system_access ON knowledge_entities FOR ALL
    USING (
        is_system_user()
        OR is_admin_user()
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Policy: Clinic users can access their clinic's entities
DROP POLICY IF EXISTS knowledge_entities_clinic_access ON knowledge_entities;
CREATE POLICY knowledge_entities_clinic_access ON knowledge_entities FOR ALL
    USING (
        clinic_id IS NOT NULL
        AND clinic_id = current_clinic_id()
    );

-- Policy: Access entities that are referenced by accessible episodic events
-- (fallback for entities without direct clinic_id)
DROP POLICY IF EXISTS knowledge_entities_event_access ON knowledge_entities;
CREATE POLICY knowledge_entities_event_access ON knowledge_entities FOR SELECT
    USING (
        clinic_id IS NULL
        AND EXISTS (
            SELECT 1 FROM entity_event_mapping eem
            JOIN episodic_events ee ON ee.id = eem.event_id
            WHERE eem.entity_id = knowledge_entities.id
              AND ee.clinic_id = current_clinic_id()
        )
    );

-- =============================================================================
-- RLS POLICIES FOR KNOWLEDGE_RELATIONS
-- =============================================================================

-- Policy: System and admin users have full access
DROP POLICY IF EXISTS knowledge_relations_system_access ON knowledge_relations;
CREATE POLICY knowledge_relations_system_access ON knowledge_relations FOR ALL
    USING (
        is_system_user()
        OR is_admin_user()
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Policy: Clinic users can access their clinic's relations
DROP POLICY IF EXISTS knowledge_relations_clinic_access ON knowledge_relations;
CREATE POLICY knowledge_relations_clinic_access ON knowledge_relations FOR ALL
    USING (
        clinic_id IS NOT NULL
        AND clinic_id = current_clinic_id()
    );

-- Policy: Access relations where source entity is accessible
-- (fallback for relations without direct clinic_id)
DROP POLICY IF EXISTS knowledge_relations_entity_access ON knowledge_relations;
CREATE POLICY knowledge_relations_entity_access ON knowledge_relations FOR SELECT
    USING (
        clinic_id IS NULL
        AND EXISTS (
            SELECT 1 FROM knowledge_entities ke
            WHERE ke.id = knowledge_relations.source_entity_id
              AND ke.clinic_id = current_clinic_id()
        )
    );

-- =============================================================================
-- RLS POLICIES FOR ENTITY_EVENT_MAPPING
-- =============================================================================

-- Policy: System and admin users have full access
DROP POLICY IF EXISTS entity_event_mapping_system_access ON entity_event_mapping;
CREATE POLICY entity_event_mapping_system_access ON entity_event_mapping FOR ALL
    USING (
        is_system_user()
        OR is_admin_user()
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Policy: Clinic users can access their clinic's mappings
DROP POLICY IF EXISTS entity_event_mapping_clinic_access ON entity_event_mapping;
CREATE POLICY entity_event_mapping_clinic_access ON entity_event_mapping FOR ALL
    USING (
        clinic_id IS NOT NULL
        AND clinic_id = current_clinic_id()
    );

-- Policy: Access mappings through episodic events
-- (fallback for mappings without direct clinic_id)
DROP POLICY IF EXISTS entity_event_mapping_event_access ON entity_event_mapping;
CREATE POLICY entity_event_mapping_event_access ON entity_event_mapping FOR SELECT
    USING (
        clinic_id IS NULL
        AND EXISTS (
            SELECT 1 FROM episodic_events ee
            WHERE ee.id = entity_event_mapping.event_id
              AND ee.clinic_id = current_clinic_id()
        )
    );

-- =============================================================================
-- GRANTS FOR APPLICATION ROLE
-- =============================================================================

-- Grant access to medicalcor_api role
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medicalcor_api') THEN
        GRANT SELECT, INSERT, UPDATE ON knowledge_entities TO medicalcor_api;
        GRANT SELECT, INSERT, UPDATE ON knowledge_relations TO medicalcor_api;
        GRANT SELECT, INSERT, UPDATE, DELETE ON entity_event_mapping TO medicalcor_api;
    END IF;
END $$;

-- =============================================================================
-- TRIGGER TO AUTO-POPULATE clinic_id ON INSERT
-- =============================================================================
-- Automatically sets clinic_id when inserting new knowledge graph records
-- if clinic_id is not provided.

-- Trigger for entity_event_mapping: inherit from episodic_event
CREATE OR REPLACE FUNCTION set_entity_event_mapping_clinic_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If clinic_id not set, look it up from the episodic event
    IF NEW.clinic_id IS NULL AND NEW.event_id IS NOT NULL THEN
        SELECT clinic_id INTO NEW.clinic_id
        FROM episodic_events
        WHERE id = NEW.event_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_entity_event_mapping_set_clinic_id ON entity_event_mapping;
CREATE TRIGGER trigger_entity_event_mapping_set_clinic_id
    BEFORE INSERT ON entity_event_mapping
    FOR EACH ROW
    EXECUTE FUNCTION set_entity_event_mapping_clinic_id();

-- Trigger for knowledge_entities: inherit from first_mentioned_event or session context
CREATE OR REPLACE FUNCTION set_knowledge_entity_clinic_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If clinic_id not set, try to get from first_mentioned_event_id
    IF NEW.clinic_id IS NULL AND NEW.first_mentioned_event_id IS NOT NULL THEN
        SELECT clinic_id INTO NEW.clinic_id
        FROM episodic_events
        WHERE id = NEW.first_mentioned_event_id;
    END IF;

    -- Fallback to session context if still null
    IF NEW.clinic_id IS NULL THEN
        NEW.clinic_id := current_clinic_id();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_knowledge_entities_set_clinic_id ON knowledge_entities;
CREATE TRIGGER trigger_knowledge_entities_set_clinic_id
    BEFORE INSERT ON knowledge_entities
    FOR EACH ROW
    EXECUTE FUNCTION set_knowledge_entity_clinic_id();

-- Trigger for knowledge_relations: inherit from source entity
CREATE OR REPLACE FUNCTION set_knowledge_relation_clinic_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If clinic_id not set, get from source entity
    IF NEW.clinic_id IS NULL AND NEW.source_entity_id IS NOT NULL THEN
        SELECT clinic_id INTO NEW.clinic_id
        FROM knowledge_entities
        WHERE id = NEW.source_entity_id;
    END IF;

    -- Fallback to session context if still null
    IF NEW.clinic_id IS NULL THEN
        NEW.clinic_id := current_clinic_id();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_knowledge_relations_set_clinic_id ON knowledge_relations;
CREATE TRIGGER trigger_knowledge_relations_set_clinic_id
    BEFORE INSERT ON knowledge_relations
    FOR EACH ROW
    EXECUTE FUNCTION set_knowledge_relation_clinic_id();

-- =============================================================================
-- UPDATE SEMANTIC SEARCH FUNCTION TO RESPECT RLS
-- =============================================================================
-- The search_knowledge_entities function needs to be updated to work with RLS
-- by using SECURITY INVOKER (default) instead of SECURITY DEFINER

DROP FUNCTION IF EXISTS search_knowledge_entities(vector(1536), VARCHAR, DECIMAL, INTEGER);

CREATE OR REPLACE FUNCTION search_knowledge_entities(
    query_embedding vector(1536),
    p_entity_type VARCHAR DEFAULT NULL,
    match_threshold DECIMAL DEFAULT 0.7,
    match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    entity_type VARCHAR,
    entity_value VARCHAR,
    canonical_form VARCHAR,
    mention_count INTEGER,
    similarity DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ke.id,
        ke.entity_type,
        ke.entity_value,
        ke.canonical_form,
        ke.mention_count,
        (1 - (ke.embedding <=> query_embedding))::DECIMAL AS similarity
    FROM knowledge_entities ke
    WHERE
        ke.deleted_at IS NULL
        AND ke.embedding IS NOT NULL
        AND (1 - (ke.embedding <=> query_embedding)) >= match_threshold
        AND (p_entity_type IS NULL OR ke.entity_type = p_entity_type)
    ORDER BY ke.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

COMMENT ON FUNCTION search_knowledge_entities IS 'Semantic search across knowledge entities (RLS-aware)';

-- =============================================================================
-- UPDATE GRAPH TRAVERSAL FUNCTION TO RESPECT RLS
-- =============================================================================

DROP FUNCTION IF EXISTS get_related_entities(UUID, VARCHAR[], DECIMAL, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_related_entities(
    p_entity_id UUID,
    p_relation_types VARCHAR[] DEFAULT NULL,
    p_min_confidence DECIMAL DEFAULT 0.5,
    p_max_depth INTEGER DEFAULT 2,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    entity_id UUID,
    entity_type VARCHAR,
    entity_value VARCHAR,
    relation_type VARCHAR,
    confidence DECIMAL,
    depth INTEGER,
    path UUID[]
) AS $$
WITH RECURSIVE entity_graph AS (
    -- Base case: direct relations
    SELECT
        ke.id AS entity_id,
        ke.entity_type,
        ke.entity_value,
        kr.relation_type,
        kr.confidence,
        1 AS depth,
        ARRAY[p_entity_id, ke.id] AS path
    FROM knowledge_relations kr
    JOIN knowledge_entities ke ON ke.id = kr.target_entity_id
    WHERE
        kr.source_entity_id = p_entity_id
        AND kr.confidence >= p_min_confidence
        AND ke.deleted_at IS NULL
        AND (p_relation_types IS NULL OR kr.relation_type = ANY(p_relation_types))

    UNION ALL

    -- Recursive case: follow relations
    SELECT
        ke.id AS entity_id,
        ke.entity_type,
        ke.entity_value,
        kr.relation_type,
        kr.confidence,
        eg.depth + 1 AS depth,
        eg.path || ke.id AS path
    FROM entity_graph eg
    JOIN knowledge_relations kr ON kr.source_entity_id = eg.entity_id
    JOIN knowledge_entities ke ON ke.id = kr.target_entity_id
    WHERE
        eg.depth < p_max_depth
        AND kr.confidence >= p_min_confidence
        AND ke.deleted_at IS NULL
        AND NOT ke.id = ANY(eg.path) -- Prevent cycles
        AND (p_relation_types IS NULL OR kr.relation_type = ANY(p_relation_types))
)
SELECT DISTINCT ON (entity_graph.entity_id)
    entity_graph.entity_id,
    entity_graph.entity_type,
    entity_graph.entity_value,
    entity_graph.relation_type,
    entity_graph.confidence,
    entity_graph.depth,
    entity_graph.path
FROM entity_graph
ORDER BY entity_graph.entity_id, entity_graph.depth, entity_graph.confidence DESC
LIMIT p_limit;
$$ LANGUAGE sql SECURITY INVOKER;

COMMENT ON FUNCTION get_related_entities IS 'Traverse knowledge graph to find related entities (RLS-aware)';

-- =============================================================================
-- UPDATE CO-OCCURRENCE FUNCTION TO RESPECT RLS
-- =============================================================================

DROP FUNCTION IF EXISTS get_entity_cooccurrences(UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_entity_cooccurrences(
    p_entity_id UUID,
    p_min_cooccurrence INTEGER DEFAULT 2,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    cooccurring_entity_id UUID,
    entity_type VARCHAR,
    entity_value VARCHAR,
    cooccurrence_count BIGINT,
    shared_event_ids UUID[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ke.id AS cooccurring_entity_id,
        ke.entity_type,
        ke.entity_value,
        COUNT(*)::BIGINT AS cooccurrence_count,
        ARRAY_AGG(DISTINCT eem1.event_id) AS shared_event_ids
    FROM entity_event_mapping eem1
    JOIN entity_event_mapping eem2 ON eem1.event_id = eem2.event_id
    JOIN knowledge_entities ke ON ke.id = eem2.entity_id
    WHERE
        eem1.entity_id = p_entity_id
        AND eem2.entity_id != p_entity_id
        AND ke.deleted_at IS NULL
    GROUP BY ke.id, ke.entity_type, ke.entity_value
    HAVING COUNT(*) >= p_min_cooccurrence
    ORDER BY cooccurrence_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

COMMENT ON FUNCTION get_entity_cooccurrences IS 'Find entities that frequently co-occur (RLS-aware)';

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON POLICY knowledge_entities_system_access ON knowledge_entities IS
    'Allow system users and admins full access to knowledge entities';

COMMENT ON POLICY knowledge_entities_clinic_access ON knowledge_entities IS
    'Allow clinic users to access only their clinic knowledge entities';

COMMENT ON POLICY knowledge_entities_event_access ON knowledge_entities IS
    'Fallback access to entities through episodic events relationship';

COMMENT ON POLICY knowledge_relations_system_access ON knowledge_relations IS
    'Allow system users and admins full access to knowledge relations';

COMMENT ON POLICY knowledge_relations_clinic_access ON knowledge_relations IS
    'Allow clinic users to access only their clinic knowledge relations';

COMMENT ON POLICY knowledge_relations_entity_access ON knowledge_relations IS
    'Fallback access to relations through source entity relationship';

COMMENT ON POLICY entity_event_mapping_system_access ON entity_event_mapping IS
    'Allow system users and admins full access to entity-event mappings';

COMMENT ON POLICY entity_event_mapping_clinic_access ON entity_event_mapping IS
    'Allow clinic users to access only their clinic entity-event mappings';

COMMENT ON POLICY entity_event_mapping_event_access ON entity_event_mapping IS
    'Fallback access to mappings through episodic events relationship';

-- ============================================================================
-- MedicalCor Core - Knowledge Graph Schema
-- ============================================================================
-- H8: Knowledge Graph Integration
-- Normalizes entities from episodic memory into a graph structure for
-- relationship discovery and semantic entity search.
-- ============================================================================

-- =============================================================================
-- Knowledge Entities Table (Normalized Entity Store)
-- =============================================================================
-- Stores unique entities extracted from episodic events for deduplication
-- and relationship tracking.
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Entity identification
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN (
        'procedure', 'date', 'amount', 'person', 'location', 'product', 'other'
    )),
    entity_value VARCHAR(500) NOT NULL,
    entity_hash VARCHAR(64) NOT NULL, -- SHA-256 hash for deduplication

    -- Normalization
    canonical_form VARCHAR(500), -- Normalized version (e.g., "dental implants" vs "implants")

    -- Semantic embedding for entity similarity search
    embedding vector(1536),
    embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small',

    -- Usage tracking
    mention_count INTEGER DEFAULT 1 NOT NULL,
    first_mentioned_event_id UUID REFERENCES episodic_events(id) ON DELETE SET NULL,

    -- Confidence from extraction
    avg_confidence DECIMAL(3,2) CHECK (avg_confidence >= 0 AND avg_confidence <= 1),

    -- Temporal tracking
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Extensibility
    metadata JSONB DEFAULT '{}',

    -- GDPR compliance (soft delete)
    deleted_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint on type + hash for deduplication
    CONSTRAINT knowledge_entities_unique UNIQUE(entity_type, entity_hash)
);

-- Comment on table
COMMENT ON TABLE knowledge_entities IS 'Normalized knowledge entities extracted from episodic memory (H8)';

-- =============================================================================
-- Indexes for Knowledge Entities
-- =============================================================================

-- Primary lookup pattern: by type and value
CREATE INDEX IF NOT EXISTS idx_entities_type_value ON knowledge_entities(entity_type, entity_value)
    WHERE deleted_at IS NULL;

-- Hash-based deduplication lookup
CREATE INDEX IF NOT EXISTS idx_entities_hash ON knowledge_entities(entity_hash)
    WHERE deleted_at IS NULL;

-- Canonical form lookup for grouping synonyms
CREATE INDEX IF NOT EXISTS idx_entities_canonical ON knowledge_entities(canonical_form)
    WHERE deleted_at IS NULL AND canonical_form IS NOT NULL;

-- Frequency-based queries (popular entities)
CREATE INDEX IF NOT EXISTS idx_entities_mention_count ON knowledge_entities(mention_count DESC)
    WHERE deleted_at IS NULL;

-- Temporal queries
CREATE INDEX IF NOT EXISTS idx_entities_observed ON knowledge_entities(last_observed_at DESC)
    WHERE deleted_at IS NULL;

-- HNSW index for semantic entity similarity search
CREATE INDEX IF NOT EXISTS idx_entities_embedding_hnsw ON knowledge_entities
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

-- =============================================================================
-- Knowledge Relations Table (Entity Relationship Graph)
-- =============================================================================
-- Captures relationships between entities detected through co-occurrence
-- or LLM-extracted relationships.
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Relation participants
    source_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,

    -- Relation classification
    relation_type VARCHAR(50) NOT NULL CHECK (relation_type IN (
        'used_for',         -- Procedure used for condition
        'part_of',          -- Entity is part of another (e.g., implant is part of treatment plan)
        'associated_with',  -- General association
        'mentioned_with',   -- Co-occurred in same event
        'prerequisite',     -- One is prerequisite for another
        'alternative_to',   -- Alternative options
        'contradicts',      -- Conflicting entities
        'temporal_before',  -- Entity occurred before another
        'temporal_after',   -- Entity occurred after another
        'temporal_during',  -- Entity occurred during another
        'related',          -- General relatedness
        'other'
    )),

    -- Relation strength
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    weight DECIMAL(5,2) DEFAULT 1.0, -- Accumulated strength from multiple observations

    -- Extraction source
    extraction_method VARCHAR(50) NOT NULL CHECK (extraction_method IN (
        'llm_extracted',    -- From LLM analysis
        'rule_based',       -- From pattern rules
        'co_occurrence',    -- From co-occurrence in events
        'manual'            -- Manual annotation
    )),

    -- Evidence
    supporting_event_ids UUID[] NOT NULL DEFAULT '{}',

    -- Context
    relation_description TEXT,

    -- Usage tracking
    occurrence_count INTEGER DEFAULT 1 NOT NULL,

    -- Temporal tracking
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Extensibility
    metadata JSONB DEFAULT '{}',

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One directed relationship per pair per type
    CONSTRAINT knowledge_relations_unique UNIQUE(source_entity_id, target_entity_id, relation_type)
);

-- Comment on table
COMMENT ON TABLE knowledge_relations IS 'Entity relationships forming the knowledge graph (H8)';

-- =============================================================================
-- Indexes for Knowledge Relations
-- =============================================================================

-- Outgoing relations from an entity
CREATE INDEX IF NOT EXISTS idx_relations_source ON knowledge_relations(source_entity_id);

-- Incoming relations to an entity
CREATE INDEX IF NOT EXISTS idx_relations_target ON knowledge_relations(target_entity_id);

-- Filter by relation type
CREATE INDEX IF NOT EXISTS idx_relations_type ON knowledge_relations(relation_type);

-- High-confidence relations
CREATE INDEX IF NOT EXISTS idx_relations_confidence ON knowledge_relations(confidence DESC);

-- Temporal queries
CREATE INDEX IF NOT EXISTS idx_relations_observed ON knowledge_relations(last_observed_at DESC);

-- Weighted relations for graph traversal
CREATE INDEX IF NOT EXISTS idx_relations_weight ON knowledge_relations(weight DESC);

-- =============================================================================
-- Entity-Event Mapping Table (Junction Table)
-- =============================================================================
-- Efficient lookup for "all events mentioning entity X" queries
-- =============================================================================

CREATE TABLE IF NOT EXISTS entity_event_mapping (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- References
    entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES episodic_events(id) ON DELETE CASCADE,

    -- Context from extraction
    extraction_position INTEGER, -- Order in which entity was extracted (1-based)
    confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Avoid duplicates
    CONSTRAINT entity_event_unique UNIQUE(entity_id, event_id)
);

-- Comment on table
COMMENT ON TABLE entity_event_mapping IS 'Junction table linking entities to their source events (H8)';

-- =============================================================================
-- Indexes for Entity-Event Mapping
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_entity_event_entity ON entity_event_mapping(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_event_event ON entity_event_mapping(event_id);

-- =============================================================================
-- Semantic Search Function for Knowledge Entities
-- =============================================================================

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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION search_knowledge_entities IS 'Semantic search across knowledge entities';

-- =============================================================================
-- Graph Traversal Function (Find Related Entities)
-- =============================================================================

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
$$ LANGUAGE sql;

COMMENT ON FUNCTION get_related_entities IS 'Traverse knowledge graph to find related entities up to N hops';

-- =============================================================================
-- Entity Co-occurrence Function
-- =============================================================================

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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_entity_cooccurrences IS 'Find entities that frequently co-occur with a given entity';

-- =============================================================================
-- Triggers for Updated Timestamps
-- =============================================================================

CREATE TRIGGER trigger_knowledge_entities_updated_at
    BEFORE UPDATE ON knowledge_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_knowledge_relations_updated_at
    BEFORE UPDATE ON knowledge_relations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS Policies (if RLS is enabled)
-- =============================================================================
-- Note: RLS policies should be added based on security requirements.
-- Knowledge graph data inherits access from episodic_events through the
-- entity_event_mapping junction table.

-- Enable RLS (uncomment when ready)
-- ALTER TABLE knowledge_entities ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE knowledge_relations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE entity_event_mapping ENABLE ROW LEVEL SECURITY;

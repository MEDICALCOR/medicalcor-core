-- MedicalCor Workflows Schema
-- Automation workflows for lead nurturing and patient communication
-- Created: 2025-11-26

-- =============================================================================
-- Workflows Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50) NOT NULL,
    trigger_config JSONB DEFAULT '{}',
    steps JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT false,
    execution_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMPTZ,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Validate trigger types
    CONSTRAINT valid_trigger_type CHECK (
        trigger_type IN (
            'new_lead',
            'appointment_scheduled',
            'appointment_completed',
            'no_response',
            'message_received',
            'tag_added',
            'status_changed'
        )
    )
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_workflows_is_active ON workflows(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workflows_trigger_type ON workflows(trigger_type);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at DESC);

-- =============================================================================
-- Workflow Templates Table (predefined templates)
-- =============================================================================
CREATE TABLE IF NOT EXISTS workflow_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    trigger_type VARCHAR(50) NOT NULL,
    trigger_config JSONB DEFAULT '{}',
    steps JSONB NOT NULL DEFAULT '[]',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_template_trigger_type CHECK (
        trigger_type IN (
            'new_lead',
            'appointment_scheduled',
            'appointment_completed',
            'no_response',
            'message_received',
            'tag_added',
            'status_changed'
        )
    ),
    CONSTRAINT valid_template_category CHECK (
        category IN ('Lead Management', 'Patient Care', 'Appointments', 'Communication', 'Custom')
    )
);

-- =============================================================================
-- Workflow Executions Table (audit trail)
-- =============================================================================
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    trigger_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'running',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    steps_completed INTEGER DEFAULT 0,
    correlation_id VARCHAR(100),

    CONSTRAINT valid_execution_status CHECK (
        status IN ('running', 'completed', 'failed', 'cancelled')
    )
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_started_at ON workflow_executions(started_at DESC);

-- =============================================================================
-- Function to increment execution count
-- =============================================================================
CREATE OR REPLACE FUNCTION increment_workflow_execution()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE workflows
    SET execution_count = execution_count + 1,
        last_executed_at = NOW()
    WHERE id = NEW.workflow_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-increment execution count
DROP TRIGGER IF EXISTS trigger_increment_workflow_execution ON workflow_executions;
CREATE TRIGGER trigger_increment_workflow_execution
    AFTER INSERT ON workflow_executions
    FOR EACH ROW
    EXECUTE FUNCTION increment_workflow_execution();

-- =============================================================================
-- Seed default workflow templates
-- =============================================================================
INSERT INTO workflow_templates (name, description, category, trigger_type, steps, is_system) VALUES
(
    'Bun venit Lead Nou',
    'Trimite mesaj de bun venit automat la lead-uri noi din WhatsApp sau Voice',
    'Lead Management',
    'new_lead',
    '[{"id":"s1","type":"action","action":{"id":"a1","type":"send_whatsapp","config":{"template":"welcome"}}}]'::jsonb,
    true
),
(
    'Follow-up Post Consultație',
    'Trimite mesaj de satisfacție la 24h după consultație',
    'Patient Care',
    'appointment_completed',
    '[{"id":"s1","type":"delay","delay":{"value":24,"unit":"hours"}},{"id":"s2","type":"action","action":{"id":"a1","type":"send_whatsapp","config":{"template":"followup"}}}]'::jsonb,
    true
),
(
    'Reminder Programare 24h',
    'Trimite reminder cu o zi înainte de programare',
    'Appointments',
    'appointment_scheduled',
    '[{"id":"s1","type":"action","action":{"id":"a1","type":"send_whatsapp","config":{"template":"reminder_24h"},"delay":{"value":24,"unit":"hours"}}}]'::jsonb,
    true
),
(
    'Reactivare Lead Inactiv',
    'Recontactează lead-uri care nu au răspuns în 3 zile',
    'Lead Management',
    'no_response',
    '[{"id":"s1","type":"action","action":{"id":"a1","type":"send_sms","config":{"message":"Încă vă putem ajuta cu informații despre procedurile noastre?"}}}]'::jsonb,
    true
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Function to update updated_at timestamp
-- =============================================================================
CREATE OR REPLACE FUNCTION update_workflow_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_workflow_timestamp ON workflows;
CREATE TRIGGER trigger_update_workflow_timestamp
    BEFORE UPDATE ON workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_timestamp();

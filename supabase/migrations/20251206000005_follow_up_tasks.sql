-- Follow-up Task Automation for Lead Nurturing (M13)
-- ================================================
-- This migration creates the infrastructure for automated follow-up task
-- management, enabling smart scheduling, escalation, and tracking of
-- lead nurturing activities.

-- ============================================
-- FOLLOW-UP TASK TYPES AND PRIORITIES
-- ============================================

-- Task priority enum
CREATE TYPE follow_up_priority AS ENUM ('urgent', 'high', 'medium', 'low');

-- Task status enum
CREATE TYPE follow_up_status AS ENUM (
  'pending',      -- Task created, not yet started
  'in_progress',  -- Agent is working on it
  'completed',    -- Successfully completed
  'escalated',    -- Escalated to supervisor
  'skipped',      -- Skipped (lead converted/lost/opted out)
  'failed'        -- Failed after max attempts
);

-- Task type enum (different follow-up activities)
CREATE TYPE follow_up_type AS ENUM (
  'initial_contact',     -- First contact after lead creation
  'follow_up_call',      -- Scheduled follow-up call
  'follow_up_message',   -- WhatsApp/SMS follow-up
  'nurture_check',       -- Check engagement during nurture
  'appointment_booking', -- Attempt to book appointment
  'post_consultation',   -- Follow-up after consultation
  'recall',              -- Patient recall (6+ months)
  'win_back',            -- Re-engage lost lead
  'escalation',          -- Escalated task requiring attention
  'custom'               -- Custom task type
);

-- Trigger type for automation
CREATE TYPE follow_up_trigger AS ENUM (
  'lead_created',        -- New lead came in
  'lead_scored',         -- Lead was scored/re-scored
  'no_response',         -- Lead didn't respond in time
  'message_received',    -- Lead sent a message
  'appointment_missed',  -- Lead missed appointment
  'appointment_cancelled', -- Appointment was cancelled
  'nurture_stage',       -- Nurture sequence milestone
  'manual',              -- Manually created
  'escalation',          -- Created by escalation
  'schedule'             -- Scheduled/recurring
);

-- ============================================
-- FOLLOW-UP TASKS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lead/Contact reference
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  hubspot_contact_id TEXT,
  phone TEXT NOT NULL,

  -- Task details
  task_type follow_up_type NOT NULL,
  trigger_type follow_up_trigger NOT NULL DEFAULT 'manual',
  title TEXT NOT NULL,
  description TEXT,

  -- Priority and status
  priority follow_up_priority NOT NULL DEFAULT 'medium',
  status follow_up_status NOT NULL DEFAULT 'pending',

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  due_by TIMESTAMPTZ NOT NULL,
  sla_minutes INTEGER NOT NULL DEFAULT 60,

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,
  assigned_by TEXT, -- 'auto' or user ID

  -- Execution tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome TEXT,
  outcome_notes TEXT,

  -- Attempt tracking
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,

  -- Escalation
  is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_at TIMESTAMPTZ,
  escalated_to UUID REFERENCES auth.users(id),
  escalation_reason TEXT,
  parent_task_id UUID REFERENCES follow_up_tasks(id),

  -- Context
  lead_score INTEGER,
  lead_classification TEXT,
  procedure_interest TEXT[],
  channel TEXT, -- 'whatsapp', 'voice', 'email'
  preferred_language TEXT DEFAULT 'ro',

  -- Automation
  automation_rule_id UUID,
  workflow_id TEXT,
  correlation_id TEXT,
  idempotency_key TEXT UNIQUE,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,

  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,

  -- Constraints
  CONSTRAINT valid_schedule CHECK (scheduled_for <= due_by),
  CONSTRAINT valid_attempts CHECK (attempt_count >= 0 AND attempt_count <= max_attempts)
);

-- ============================================
-- FOLLOW-UP TASK TEMPLATES
-- ============================================

CREATE TABLE IF NOT EXISTS follow_up_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template identification
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,

  -- Task configuration
  task_type follow_up_type NOT NULL,
  default_priority follow_up_priority NOT NULL DEFAULT 'medium',
  default_sla_minutes INTEGER NOT NULL DEFAULT 60,
  default_max_attempts INTEGER NOT NULL DEFAULT 3,

  -- Content templates
  title_template TEXT NOT NULL,
  description_template TEXT,

  -- Channel configuration
  preferred_channel TEXT DEFAULT 'whatsapp',

  -- Message templates (per language)
  message_templates JSONB DEFAULT '{}',
  -- Example: {"ro": {"initial": "...", "follow_up": "..."}, "en": {...}}

  -- Timing
  delay_hours INTEGER DEFAULT 0,
  retry_delay_hours INTEGER DEFAULT 24,

  -- Conditions
  applies_to_classifications TEXT[] DEFAULT ARRAY['HOT', 'WARM', 'COLD'],
  applies_to_statuses TEXT[] DEFAULT ARRAY['new', 'contacted', 'qualified', 'nurturing'],

  -- Active flag
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

-- ============================================
-- FOLLOW-UP AUTOMATION RULES
-- ============================================

CREATE TABLE IF NOT EXISTS follow_up_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule identification
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,

  -- Trigger configuration
  trigger_event TEXT NOT NULL,
  -- Example: 'lead.created', 'lead.scored', 'no_response_24h'

  -- Conditions (JSONB for flexibility)
  conditions JSONB NOT NULL DEFAULT '{}',
  -- Example: {"classification": ["HOT", "WARM"], "min_score": 3}

  -- Action configuration
  template_id UUID REFERENCES follow_up_templates(id),
  priority_override follow_up_priority,
  delay_minutes INTEGER DEFAULT 0,

  -- Assignment rules
  auto_assign BOOLEAN NOT NULL DEFAULT TRUE,
  assignment_strategy TEXT DEFAULT 'round_robin',
  -- Options: 'round_robin', 'least_loaded', 'skill_based', 'fixed'
  fixed_assignee_id UUID REFERENCES auth.users(id),

  -- Execution limits
  max_tasks_per_lead INTEGER DEFAULT 10,
  cooldown_hours INTEGER DEFAULT 24,

  -- Active and ordering
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority_order INTEGER NOT NULL DEFAULT 100,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

-- ============================================
-- FOLLOW-UP TASK HISTORY
-- ============================================

CREATE TABLE IF NOT EXISTS follow_up_task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES follow_up_tasks(id) ON DELETE CASCADE,

  -- Change tracking
  action TEXT NOT NULL,
  -- Actions: 'created', 'assigned', 'started', 'attempted', 'completed',
  --          'escalated', 'skipped', 'failed', 'updated'

  previous_status follow_up_status,
  new_status follow_up_status,

  -- Details
  details JSONB DEFAULT '{}',
  notes TEXT,

  -- Actor
  performed_by TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Correlation
  correlation_id TEXT
);

-- ============================================
-- FOLLOW-UP TASK METRICS
-- ============================================

CREATE TABLE IF NOT EXISTS follow_up_task_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Time period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type TEXT NOT NULL, -- 'hourly', 'daily', 'weekly'

  -- Task counts
  tasks_created INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_escalated INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  tasks_skipped INTEGER NOT NULL DEFAULT 0,

  -- Response metrics
  avg_response_time_minutes NUMERIC(10,2),
  avg_completion_time_minutes NUMERIC(10,2),
  sla_met_count INTEGER NOT NULL DEFAULT 0,
  sla_breached_count INTEGER NOT NULL DEFAULT 0,

  -- Conversion metrics
  leads_contacted INTEGER NOT NULL DEFAULT 0,
  leads_engaged INTEGER NOT NULL DEFAULT 0,
  leads_converted INTEGER NOT NULL DEFAULT 0,

  -- By type breakdown (JSONB)
  by_type JSONB DEFAULT '{}',
  by_priority JSONB DEFAULT '{}',
  by_agent JSONB DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(period_start, period_end, period_type)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Follow-up tasks indexes
CREATE INDEX idx_follow_up_tasks_status ON follow_up_tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_follow_up_tasks_scheduled ON follow_up_tasks(scheduled_for) WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX idx_follow_up_tasks_due ON follow_up_tasks(due_by) WHERE status IN ('pending', 'in_progress') AND deleted_at IS NULL;
CREATE INDEX idx_follow_up_tasks_assigned ON follow_up_tasks(assigned_to, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_follow_up_tasks_lead ON follow_up_tasks(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_follow_up_tasks_hubspot ON follow_up_tasks(hubspot_contact_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_follow_up_tasks_phone ON follow_up_tasks(phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_follow_up_tasks_priority ON follow_up_tasks(priority, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_follow_up_tasks_escalated ON follow_up_tasks(is_escalated, status) WHERE is_escalated = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_follow_up_tasks_correlation ON follow_up_tasks(correlation_id);
CREATE INDEX idx_follow_up_tasks_type ON follow_up_tasks(task_type, status) WHERE deleted_at IS NULL;

-- History indexes
CREATE INDEX idx_follow_up_history_task ON follow_up_task_history(task_id);
CREATE INDEX idx_follow_up_history_performed_at ON follow_up_task_history(performed_at);

-- Metrics indexes
CREATE INDEX idx_follow_up_metrics_period ON follow_up_task_metrics(period_start, period_type);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_follow_up_task_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_follow_up_tasks_updated
  BEFORE UPDATE ON follow_up_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_follow_up_task_timestamp();

CREATE TRIGGER trg_follow_up_templates_updated
  BEFORE UPDATE ON follow_up_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_follow_up_task_timestamp();

CREATE TRIGGER trg_follow_up_automation_rules_updated
  BEFORE UPDATE ON follow_up_automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_follow_up_task_timestamp();

-- History tracking trigger
CREATE OR REPLACE FUNCTION record_follow_up_task_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO follow_up_task_history (task_id, action, new_status, details, performed_by, correlation_id)
    VALUES (
      NEW.id,
      'created',
      NEW.status,
      jsonb_build_object(
        'task_type', NEW.task_type,
        'priority', NEW.priority,
        'scheduled_for', NEW.scheduled_for
      ),
      NEW.created_by,
      NEW.correlation_id
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO follow_up_task_history (task_id, action, previous_status, new_status, performed_by, correlation_id)
      VALUES (
        NEW.id,
        CASE
          WHEN NEW.status = 'in_progress' THEN 'started'
          WHEN NEW.status = 'completed' THEN 'completed'
          WHEN NEW.status = 'escalated' THEN 'escalated'
          WHEN NEW.status = 'skipped' THEN 'skipped'
          WHEN NEW.status = 'failed' THEN 'failed'
          ELSE 'updated'
        END,
        OLD.status,
        NEW.status,
        COALESCE(NEW.assigned_to::TEXT, 'system'),
        NEW.correlation_id
      );
    END IF;

    -- Track assignment changes
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
      INSERT INTO follow_up_task_history (task_id, action, details, performed_by, correlation_id)
      VALUES (
        NEW.id,
        'assigned',
        jsonb_build_object(
          'previous_assignee', OLD.assigned_to,
          'new_assignee', NEW.assigned_to,
          'assigned_by', NEW.assigned_by
        ),
        NEW.assigned_by,
        NEW.correlation_id
      );
    END IF;

    -- Track attempt updates
    IF OLD.attempt_count < NEW.attempt_count THEN
      INSERT INTO follow_up_task_history (task_id, action, details, performed_by, correlation_id)
      VALUES (
        NEW.id,
        'attempted',
        jsonb_build_object(
          'attempt_number', NEW.attempt_count,
          'outcome', NEW.outcome
        ),
        COALESCE(NEW.assigned_to::TEXT, 'system'),
        NEW.correlation_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_follow_up_task_history
  AFTER INSERT OR UPDATE ON follow_up_tasks
  FOR EACH ROW
  EXECUTE FUNCTION record_follow_up_task_history();

-- ============================================
-- DEFAULT TEMPLATES
-- ============================================

INSERT INTO follow_up_templates (name, display_name, description, task_type, default_priority, default_sla_minutes, title_template, description_template, message_templates) VALUES
(
  'hot_lead_initial',
  'Hot Lead Initial Contact',
  'Immediate follow-up for hot leads',
  'initial_contact',
  'urgent',
  30,
  'URGENT: Contact hot lead - {{phone}}',
  'High-intent lead requires immediate contact. Score: {{score}}/5. Interested in: {{procedures}}',
  '{"ro": {"initial": "Bună ziua! Am observat interesul dumneavoastră pentru {{procedures}}. Sunt aici să vă ajut cu programarea unei consultații."}}'
),
(
  'warm_lead_follow_up',
  'Warm Lead Follow-up',
  '24-hour follow-up for warm leads',
  'follow_up_message',
  'high',
  240,
  'Follow up with warm lead - {{name}}',
  'Warm lead requires follow-up within 24 hours. Score: {{score}}/5',
  '{"ro": {"initial": "Bună ziua {{name}}! Vă contactăm pentru a afla dacă mai aveți întrebări despre serviciile noastre."}}'
),
(
  'cold_lead_nurture',
  'Cold Lead Nurture',
  'Long-term nurture for cold leads',
  'nurture_check',
  'medium',
  1440,
  'Nurture check for {{name}}',
  'Cold lead nurture sequence milestone',
  '{"ro": {"initial": "Bună ziua! Ne-am gândit la dumneavoastră. Dacă aveți întrebări despre serviciile noastre, suntem aici."}}'
),
(
  'no_response_follow_up',
  'No Response Follow-up',
  'Follow-up when lead has not responded',
  'follow_up_call',
  'high',
  120,
  'No response from {{name}} - attempt call',
  'Lead has not responded to messages. Attempt phone call.',
  '{}'
),
(
  'post_consultation_check',
  'Post-Consultation Check',
  'Follow-up after consultation',
  'post_consultation',
  'medium',
  1440,
  'Post-consultation follow-up with {{name}}',
  'Check on patient satisfaction and next steps after consultation',
  '{"ro": {"initial": "Bună ziua {{name}}! Sperăm că consultația a fost utilă. Aveți întrebări suplimentare despre planul de tratament?"}}'
),
(
  'recall_reminder',
  'Patient Recall',
  '6-month recall for existing patients',
  'recall',
  'low',
  2880,
  'Recall: {{name}} - 6 months since last visit',
  'Patient is due for routine recall appointment',
  '{"ro": {"initial": "Bună ziua {{name}}! Au trecut 6 luni de la ultima vizită. Vă recomandăm o programare de control."}}'
),
(
  'appointment_booking_attempt',
  'Appointment Booking',
  'Attempt to book appointment for engaged lead',
  'appointment_booking',
  'high',
  60,
  'Book appointment for {{name}}',
  'Lead is ready to book. Attempt to schedule appointment.',
  '{}'
),
(
  'escalation_task',
  'Escalation Task',
  'Escalated task requiring supervisor attention',
  'escalation',
  'urgent',
  30,
  'ESCALATION: {{original_task_title}}',
  'Task escalated after {{attempt_count}} failed attempts. Original task: {{task_id}}',
  '{}'
)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- DEFAULT AUTOMATION RULES
-- ============================================

INSERT INTO follow_up_automation_rules (name, display_name, description, trigger_event, conditions, template_id, delay_minutes, priority_order) VALUES
(
  'hot_lead_immediate',
  'Hot Lead Immediate Contact',
  'Create urgent task for hot leads immediately',
  'lead.scored',
  '{"classification": ["HOT"], "min_score": 4}',
  (SELECT id FROM follow_up_templates WHERE name = 'hot_lead_initial'),
  0,
  10
),
(
  'warm_lead_24h',
  'Warm Lead 24h Follow-up',
  'Schedule follow-up for warm leads in 24 hours',
  'lead.scored',
  '{"classification": ["WARM"], "min_score": 3}',
  (SELECT id FROM follow_up_templates WHERE name = 'warm_lead_follow_up'),
  1440,
  20
),
(
  'cold_lead_nurture',
  'Cold Lead Nurture Start',
  'Start nurture sequence for cold leads',
  'lead.scored',
  '{"classification": ["COLD"]}',
  (SELECT id FROM follow_up_templates WHERE name = 'cold_lead_nurture'),
  2880,
  30
),
(
  'no_response_4h',
  'No Response 4 Hour Follow-up',
  'Create follow-up task when lead does not respond within 4 hours',
  'no_response',
  '{"hours_since_contact": 4, "classification": ["HOT", "WARM"]}',
  (SELECT id FROM follow_up_templates WHERE name = 'no_response_follow_up'),
  0,
  15
),
(
  'post_consultation',
  'Post-Consultation Follow-up',
  'Schedule follow-up 24 hours after consultation',
  'appointment.completed',
  '{}',
  (SELECT id FROM follow_up_templates WHERE name = 'post_consultation_check'),
  1440,
  40
),
(
  'recall_6_months',
  'Patient 6-Month Recall',
  'Create recall task for patients not seen in 6 months',
  'schedule',
  '{"months_since_visit": 6, "lifecycle_stage": "customer"}',
  (SELECT id FROM follow_up_templates WHERE name = 'recall_reminder'),
  0,
  50
)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE follow_up_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_task_metrics ENABLE ROW LEVEL SECURITY;

-- Tasks policies
CREATE POLICY "Service role can manage all follow-up tasks"
  ON follow_up_tasks FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Agents can view assigned tasks"
  ON follow_up_tasks FOR SELECT
  USING (assigned_to = auth.uid() OR auth.role() = 'service_role');

CREATE POLICY "Agents can update assigned tasks"
  ON follow_up_tasks FOR UPDATE
  USING (assigned_to = auth.uid() OR auth.role() = 'service_role');

-- Templates policies (read-only for agents)
CREATE POLICY "Anyone can view active templates"
  ON follow_up_templates FOR SELECT
  USING (is_active = TRUE OR auth.role() = 'service_role');

CREATE POLICY "Service role can manage templates"
  ON follow_up_templates FOR ALL
  USING (auth.role() = 'service_role');

-- Automation rules policies
CREATE POLICY "Anyone can view active automation rules"
  ON follow_up_automation_rules FOR SELECT
  USING (is_active = TRUE OR auth.role() = 'service_role');

CREATE POLICY "Service role can manage automation rules"
  ON follow_up_automation_rules FOR ALL
  USING (auth.role() = 'service_role');

-- History policies
CREATE POLICY "Service role can manage task history"
  ON follow_up_task_history FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Agents can view history for assigned tasks"
  ON follow_up_task_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM follow_up_tasks t
      WHERE t.id = follow_up_task_history.task_id
      AND (t.assigned_to = auth.uid() OR auth.role() = 'service_role')
    )
  );

-- Metrics policies
CREATE POLICY "Service role can manage metrics"
  ON follow_up_task_metrics FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can view metrics"
  ON follow_up_task_metrics FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE follow_up_tasks IS 'Automated follow-up tasks for lead nurturing (M13)';
COMMENT ON TABLE follow_up_templates IS 'Templates for creating follow-up tasks';
COMMENT ON TABLE follow_up_automation_rules IS 'Rules that automatically create follow-up tasks based on events';
COMMENT ON TABLE follow_up_task_history IS 'Audit trail for all follow-up task changes';
COMMENT ON TABLE follow_up_task_metrics IS 'Aggregated metrics for follow-up task performance';

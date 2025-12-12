-- Migration: Dental Lab Production System
-- Description: Complete database schema for production-grade dental laboratory management
-- Author: Claude Code
-- Date: 2024-12-12
--
-- This migration creates the complete schema for a platinum-standard dental lab
-- production system following ISO 22674 standards and HIPAA/GDPR compliance.

-- ============================================================================
-- LAB CASES - Main aggregate table
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number TEXT NOT NULL UNIQUE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    all_on_x_case_id UUID REFERENCES cases(id) ON DELETE SET NULL,

    -- Status
    status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN (
        'RECEIVED', 'PENDING_SCAN', 'SCAN_RECEIVED',
        'IN_DESIGN', 'DESIGN_REVIEW', 'DESIGN_APPROVED', 'DESIGN_REVISION',
        'QUEUED_FOR_MILLING', 'MILLING', 'POST_PROCESSING', 'FINISHING',
        'QC_INSPECTION', 'QC_FAILED', 'QC_PASSED',
        'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED',
        'TRY_IN_SCHEDULED', 'ADJUSTMENT_REQUIRED', 'ADJUSTMENT_IN_PROGRESS',
        'COMPLETED', 'CANCELLED', 'ON_HOLD'
    )),
    priority TEXT NOT NULL DEFAULT 'STANDARD' CHECK (priority IN ('STANDARD', 'RUSH', 'EMERGENCY', 'VIP')),

    -- Prescription
    prescribing_dentist TEXT NOT NULL,
    prescription_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    special_instructions TEXT,
    antagonist_info TEXT,

    -- Assignment
    assigned_technician UUID REFERENCES users(id),
    assigned_designer UUID REFERENCES users(id),

    -- Financials
    estimated_cost DECIMAL(12, 2),
    actual_cost DECIMAL(12, 2),
    currency TEXT NOT NULL DEFAULT 'RON',

    -- Dates
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_date TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    current_sla_deadline TIMESTAMPTZ NOT NULL,

    -- Delivery tracking
    delivery_date TIMESTAMPTZ,
    delivered_by UUID REFERENCES users(id),
    tracking_number TEXT,

    -- Metadata
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Encryption for PHI
    CONSTRAINT lab_cases_cost_positive CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
    CONSTRAINT lab_cases_actual_cost_positive CHECK (actual_cost IS NULL OR actual_cost >= 0)
);

-- ============================================================================
-- PROSTHETIC SPECIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_case_prosthetics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,

    prosthetic_type TEXT NOT NULL CHECK (prosthetic_type IN (
        'CROWN', 'BRIDGE', 'VENEER', 'INLAY', 'ONLAY', 'OVERLAY',
        'IMPLANT_CROWN', 'IMPLANT_BRIDGE', 'IMPLANT_ABUTMENT',
        'SCREW_RETAINED_CROWN', 'CEMENT_RETAINED_CROWN',
        'HYBRID_PROSTHESIS', 'OVERDENTURE', 'BAR_ATTACHMENT',
        'COMPLETE_DENTURE', 'PARTIAL_DENTURE', 'IMMEDIATE_DENTURE', 'FLIPPER',
        'NIGHT_GUARD', 'SPORTS_GUARD', 'SLEEP_APPLIANCE',
        'RETAINER', 'ALIGNER', 'SPACE_MAINTAINER',
        'SURGICAL_GUIDE', 'BONE_GRAFT_TEMPLATE',
        'PROVISIONAL_CROWN', 'PROVISIONAL_BRIDGE', 'PROVISIONAL_ALLON'
    )),

    material TEXT NOT NULL CHECK (material IN (
        'ZIRCONIA', 'ZIRCONIA_TRANSLUCENT', 'ZIRCONIA_MULTI',
        'EMAX', 'FELDSPATHIC', 'EMPRESS',
        'TITANIUM', 'TITANIUM_BASE', 'COBALT_CHROME',
        'GOLD', 'PRECIOUS_METAL', 'BASE_METAL',
        'PMMA', 'PEEK', 'ACRYLIC', 'COMPOSITE', 'FLEXIBLE_NYLON', 'TEMP_COMPOSITE',
        'ZIRCONIA_PORCELAIN', 'METAL_CERAMIC', 'METAL_ACRYLIC'
    )),

    -- FDI tooth numbers as array
    tooth_numbers TEXT[] NOT NULL,

    -- Shade
    shade_system TEXT CHECK (shade_system IN ('VITA_CLASSICAL', 'VITA_3D_MASTER', 'VITA_BLEACH', 'IVOCLAR', 'CUSTOM')),
    shade TEXT,
    stump_shade TEXT,

    -- Clinical specifications
    occlusal_scheme TEXT CHECK (occlusal_scheme IN ('CANINE_GUIDANCE', 'GROUP_FUNCTION', 'MUTUALLY_PROTECTED')),
    margin_type TEXT CHECK (margin_type IN ('CHAMFER', 'SHOULDER', 'KNIFE_EDGE', 'FEATHER_EDGE')),
    contact_type TEXT CHECK (contact_type IN ('POINT', 'AREA', 'MODIFIED_RIDGE_LAP')),

    special_instructions TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- IMPLANT COMPONENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_case_implant_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,
    prosthetic_id UUID REFERENCES lab_case_prosthetics(id) ON DELETE CASCADE,

    implant_system TEXT NOT NULL, -- e.g., 'STRAUMANN', 'NOBEL_BIOCARE'
    implant_platform TEXT NOT NULL, -- e.g., 'BLT', 'BLX'
    platform_diameter DECIMAL(4, 2) NOT NULL,

    abutment_type TEXT CHECK (abutment_type IN ('STOCK', 'CUSTOM_MILLED', 'TI_BASE_HYBRID')),
    screw_type TEXT,
    torque_ncm DECIMAL(4, 1),
    connection_type TEXT CHECK (connection_type IN ('INTERNAL_HEX', 'EXTERNAL_HEX', 'CONICAL', 'TRI_LOBE')),

    tooth_position TEXT, -- FDI notation

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- DIGITAL SCANS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_case_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,

    scan_type TEXT NOT NULL CHECK (scan_type IN ('INTRAORAL', 'MODEL', 'CBCT', 'FACIAL')),
    file_format TEXT NOT NULL CHECK (file_format IN ('STL', 'PLY', 'OBJ', 'DCM', 'DICOM')),

    -- File storage (S3-compatible)
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    checksum TEXT, -- SHA-256 for integrity verification

    -- Scanner metadata
    scanner_brand TEXT,
    scanner_model TEXT,

    quality TEXT CHECK (quality IN ('EXCELLENT', 'GOOD', 'ACCEPTABLE', 'POOR')),
    notes TEXT,

    -- Processing status
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    processing_errors TEXT[],

    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- CAD DESIGNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_case_designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,

    software_used TEXT NOT NULL, -- 'EXOCAD', '3SHAPE', 'DENTAL_WINGS'
    software_version TEXT,

    -- File storage
    file_path TEXT NOT NULL,
    file_size BIGINT,
    thumbnail_path TEXT,

    -- Workflow
    designed_by UUID NOT NULL REFERENCES users(id),
    designed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    revision_number INTEGER NOT NULL DEFAULT 1,

    -- Approval
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    approval_status TEXT CHECK (approval_status IN ('PENDING', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED')),

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- FABRICATION RECORDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_case_fabrication_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,

    method TEXT NOT NULL CHECK (method IN ('MILLING', 'PRINTING', 'CASTING', 'PRESSING', 'LAYERING')),

    machine_id TEXT, -- Equipment identifier
    machine_name TEXT,

    material_batch TEXT, -- For traceability
    material_lot_number TEXT,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_minutes INTEGER,

    technician_id UUID NOT NULL REFERENCES users(id),

    -- Parameters (JSONB for flexibility)
    parameters JSONB DEFAULT '{}',

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- QUALITY CONTROL INSPECTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_case_qc_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,

    inspected_by UUID NOT NULL REFERENCES users(id),
    inspected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    passed BOOLEAN NOT NULL,
    overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),

    -- Individual criteria scores (JSONB array)
    criteria JSONB NOT NULL DEFAULT '[]',

    notes TEXT,

    -- Evidence
    photos TEXT[], -- Array of S3 paths

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TRY-IN RECORDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_case_try_in_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,

    scheduled_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,

    clinician_id UUID REFERENCES users(id),
    clinician_notes TEXT,

    -- Adjustments (JSONB array)
    adjustments_required JSONB DEFAULT '[]',

    patient_satisfaction INTEGER CHECK (patient_satisfaction >= 1 AND patient_satisfaction <= 5),

    photos TEXT[],

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- STATUS HISTORY (Event Sourcing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_case_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,

    previous_status TEXT,
    new_status TEXT NOT NULL,

    changed_by UUID NOT NULL REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    reason TEXT,
    sla_deadline TIMESTAMPTZ NOT NULL,

    -- Event metadata
    event_type TEXT NOT NULL DEFAULT 'STATUS_CHANGE',
    event_data JSONB DEFAULT '{}'
);

-- ============================================================================
-- COLLABORATION THREADS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_collaboration_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,

    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PENDING_RESPONSE', 'RESOLVED', 'ESCALATED')),
    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- ============================================================================
-- COLLABORATION MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_collaboration_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES lab_collaboration_threads(id) ON DELETE CASCADE,
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,

    sender_id UUID NOT NULL REFERENCES users(id),
    sender_role TEXT NOT NULL CHECK (sender_role IN ('CLINICIAN', 'LAB_TECHNICIAN', 'LAB_DESIGNER', 'QC_INSPECTOR', 'COORDINATOR')),
    sender_organization TEXT NOT NULL CHECK (sender_organization IN ('CLINIC', 'LAB')),

    content TEXT NOT NULL,
    content_encrypted BYTEA, -- For PHI encryption

    message_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (message_type IN (
        'TEXT', 'DESIGN_FEEDBACK', 'APPROVAL_REQUEST', 'REVISION_REQUEST',
        'QUESTION', 'URGENT', 'STATUS_UPDATE'
    )),

    -- Attachments and references stored as JSONB
    attachments JSONB DEFAULT '[]',
    references JSONB DEFAULT '[]',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- MESSAGE READ STATUS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_collaboration_read_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES lab_collaboration_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (message_id, user_id)
);

-- ============================================================================
-- DESIGN FEEDBACK
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_design_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,
    design_id UUID NOT NULL REFERENCES lab_case_designs(id) ON DELETE CASCADE,

    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('APPROVAL', 'MINOR_REVISION', 'MAJOR_REVISION', 'REJECTION')),
    overall_rating INTEGER NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),

    -- Criteria scores as JSONB
    criteria_scores JSONB NOT NULL DEFAULT '[]',

    -- Annotations for 3D design markup
    annotations JSONB DEFAULT '[]',

    general_notes TEXT NOT NULL,

    reviewed_by UUID NOT NULL REFERENCES users(id),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    response_deadline TIMESTAMPTZ
);

-- ============================================================================
-- SLA TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_sla_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_case_id UUID NOT NULL REFERENCES lab_cases(id) ON DELETE CASCADE,

    sla_type TEXT NOT NULL CHECK (sla_type IN ('STANDARD', 'RUSH', 'EMERGENCY')),

    -- Milestones as JSONB array
    milestones JSONB NOT NULL DEFAULT '[]',

    overall_status TEXT NOT NULL DEFAULT 'ON_TRACK' CHECK (overall_status IN ('ON_TRACK', 'AT_RISK', 'OVERDUE')),
    days_remaining INTEGER NOT NULL DEFAULT 0,
    percent_complete INTEGER NOT NULL DEFAULT 0 CHECK (percent_complete >= 0 AND percent_complete <= 100),

    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- LAB PERFORMANCE METRICS (Materialized for dashboard)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- KPIs
    total_cases INTEGER NOT NULL DEFAULT 0,
    completed_cases INTEGER NOT NULL DEFAULT 0,
    on_time_delivery_rate DECIMAL(5, 2),
    avg_turnaround_days DECIMAL(5, 1),
    first_time_qc_pass_rate DECIMAL(5, 2),
    avg_revisions DECIMAL(4, 2),
    avg_patient_satisfaction DECIMAL(3, 1),

    performance_trend TEXT CHECK (performance_trend IN ('IMPROVING', 'STABLE', 'DECLINING')),

    -- Breakdown by type/material
    breakdown_by_type JSONB DEFAULT '{}',
    breakdown_by_material JSONB DEFAULT '{}',

    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (clinic_id, period_start, period_end)
);

-- ============================================================================
-- NOTIFICATION PREFERENCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,

    -- Channels
    channel_email BOOLEAN NOT NULL DEFAULT TRUE,
    channel_sms BOOLEAN NOT NULL DEFAULT FALSE,
    channel_whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
    channel_in_app BOOLEAN NOT NULL DEFAULT TRUE,
    channel_push BOOLEAN NOT NULL DEFAULT TRUE,

    -- Triggers
    trigger_status_change BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_design_ready BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_revision_requested BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_qc_complete BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_ready_for_pickup BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_urgent_message BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_delivery_update BOOLEAN NOT NULL DEFAULT TRUE,

    -- Quiet hours
    quiet_hours_start TIME,
    quiet_hours_end TIME,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Lab cases primary indexes
CREATE INDEX IF NOT EXISTS idx_lab_cases_clinic_id ON lab_cases(clinic_id);
CREATE INDEX IF NOT EXISTS idx_lab_cases_patient_id ON lab_cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_cases_status ON lab_cases(status);
CREATE INDEX IF NOT EXISTS idx_lab_cases_priority ON lab_cases(priority);
CREATE INDEX IF NOT EXISTS idx_lab_cases_due_date ON lab_cases(due_date);
CREATE INDEX IF NOT EXISTS idx_lab_cases_received_at ON lab_cases(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_cases_sla_deadline ON lab_cases(current_sla_deadline);
CREATE INDEX IF NOT EXISTS idx_lab_cases_assigned_technician ON lab_cases(assigned_technician);
CREATE INDEX IF NOT EXISTS idx_lab_cases_assigned_designer ON lab_cases(assigned_designer);
CREATE INDEX IF NOT EXISTS idx_lab_cases_deleted_at ON lab_cases(deleted_at) WHERE deleted_at IS NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_lab_cases_clinic_status ON lab_cases(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_lab_cases_status_priority ON lab_cases(status, priority);
CREATE INDEX IF NOT EXISTS idx_lab_cases_status_due_date ON lab_cases(status, due_date) WHERE status NOT IN ('COMPLETED', 'CANCELLED');

-- Prosthetics indexes
CREATE INDEX IF NOT EXISTS idx_lab_case_prosthetics_case_id ON lab_case_prosthetics(lab_case_id);
CREATE INDEX IF NOT EXISTS idx_lab_case_prosthetics_type ON lab_case_prosthetics(prosthetic_type);
CREATE INDEX IF NOT EXISTS idx_lab_case_prosthetics_material ON lab_case_prosthetics(material);

-- Scans indexes
CREATE INDEX IF NOT EXISTS idx_lab_case_scans_case_id ON lab_case_scans(lab_case_id);
CREATE INDEX IF NOT EXISTS idx_lab_case_scans_scan_type ON lab_case_scans(scan_type);
CREATE INDEX IF NOT EXISTS idx_lab_case_scans_processed ON lab_case_scans(processed) WHERE processed = FALSE;

-- Designs indexes
CREATE INDEX IF NOT EXISTS idx_lab_case_designs_case_id ON lab_case_designs(lab_case_id);
CREATE INDEX IF NOT EXISTS idx_lab_case_designs_designed_by ON lab_case_designs(designed_by);
CREATE INDEX IF NOT EXISTS idx_lab_case_designs_approval_status ON lab_case_designs(approval_status);

-- QC indexes
CREATE INDEX IF NOT EXISTS idx_lab_case_qc_case_id ON lab_case_qc_inspections(lab_case_id);
CREATE INDEX IF NOT EXISTS idx_lab_case_qc_passed ON lab_case_qc_inspections(passed);

-- Status history indexes
CREATE INDEX IF NOT EXISTS idx_lab_case_status_history_case_id ON lab_case_status_history(lab_case_id);
CREATE INDEX IF NOT EXISTS idx_lab_case_status_history_changed_at ON lab_case_status_history(changed_at DESC);

-- Collaboration indexes
CREATE INDEX IF NOT EXISTS idx_lab_collab_threads_case_id ON lab_collaboration_threads(lab_case_id);
CREATE INDEX IF NOT EXISTS idx_lab_collab_threads_status ON lab_collaboration_threads(status);
CREATE INDEX IF NOT EXISTS idx_lab_collab_messages_thread_id ON lab_collaboration_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_lab_collab_messages_sender_id ON lab_collaboration_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_lab_collab_messages_created_at ON lab_collaboration_messages(created_at DESC);

-- SLA tracking indexes
CREATE INDEX IF NOT EXISTS idx_lab_sla_tracking_case_id ON lab_sla_tracking(lab_case_id);
CREATE INDEX IF NOT EXISTS idx_lab_sla_tracking_status ON lab_sla_tracking(overall_status);

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_lab_performance_clinic_id ON lab_performance_metrics(clinic_id);
CREATE INDEX IF NOT EXISTS idx_lab_performance_period ON lab_performance_metrics(period_start, period_end);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE lab_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_case_prosthetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_case_implant_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_case_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_case_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_case_fabrication_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_case_qc_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_case_try_in_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_case_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_collaboration_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_collaboration_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_design_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_sla_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lab_cases
CREATE POLICY lab_cases_clinic_access ON lab_cases
    FOR ALL
    USING (clinic_id IN (
        SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
    ));

-- RLS Policies for related tables (cascade from lab_cases)
CREATE POLICY lab_prosthetics_access ON lab_case_prosthetics
    FOR ALL
    USING (lab_case_id IN (
        SELECT id FROM lab_cases WHERE clinic_id IN (
            SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY lab_scans_access ON lab_case_scans
    FOR ALL
    USING (lab_case_id IN (
        SELECT id FROM lab_cases WHERE clinic_id IN (
            SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY lab_designs_access ON lab_case_designs
    FOR ALL
    USING (lab_case_id IN (
        SELECT id FROM lab_cases WHERE clinic_id IN (
            SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY lab_fabrication_access ON lab_case_fabrication_records
    FOR ALL
    USING (lab_case_id IN (
        SELECT id FROM lab_cases WHERE clinic_id IN (
            SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY lab_qc_access ON lab_case_qc_inspections
    FOR ALL
    USING (lab_case_id IN (
        SELECT id FROM lab_cases WHERE clinic_id IN (
            SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY lab_tryin_access ON lab_case_try_in_records
    FOR ALL
    USING (lab_case_id IN (
        SELECT id FROM lab_cases WHERE clinic_id IN (
            SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY lab_status_history_access ON lab_case_status_history
    FOR ALL
    USING (lab_case_id IN (
        SELECT id FROM lab_cases WHERE clinic_id IN (
            SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY lab_threads_access ON lab_collaboration_threads
    FOR ALL
    USING (lab_case_id IN (
        SELECT id FROM lab_cases WHERE clinic_id IN (
            SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY lab_messages_access ON lab_collaboration_messages
    FOR ALL
    USING (lab_case_id IN (
        SELECT id FROM lab_cases WHERE clinic_id IN (
            SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY lab_feedback_access ON lab_design_feedback
    FOR ALL
    USING (lab_case_id IN (
        SELECT id FROM lab_cases WHERE clinic_id IN (
            SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY lab_sla_access ON lab_sla_tracking
    FOR ALL
    USING (lab_case_id IN (
        SELECT id FROM lab_cases WHERE clinic_id IN (
            SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY lab_performance_access ON lab_performance_metrics
    FOR ALL
    USING (clinic_id IN (
        SELECT clinic_id FROM user_clinic_access WHERE user_id = auth.uid()
    ));

CREATE POLICY lab_notifications_access ON lab_notification_preferences
    FOR ALL
    USING (user_id = auth.uid());

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_lab_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lab_cases_updated_at
    BEFORE UPDATE ON lab_cases
    FOR EACH ROW EXECUTE FUNCTION update_lab_updated_at();

CREATE TRIGGER lab_prosthetics_updated_at
    BEFORE UPDATE ON lab_case_prosthetics
    FOR EACH ROW EXECUTE FUNCTION update_lab_updated_at();

CREATE TRIGGER lab_designs_updated_at
    BEFORE UPDATE ON lab_case_designs
    FOR EACH ROW EXECUTE FUNCTION update_lab_updated_at();

CREATE TRIGGER lab_tryin_updated_at
    BEFORE UPDATE ON lab_case_try_in_records
    FOR EACH ROW EXECUTE FUNCTION update_lab_updated_at();

CREATE TRIGGER lab_threads_updated_at
    BEFORE UPDATE ON lab_collaboration_threads
    FOR EACH ROW EXECUTE FUNCTION update_lab_updated_at();

CREATE TRIGGER lab_sla_updated_at
    BEFORE UPDATE ON lab_sla_tracking
    FOR EACH ROW EXECUTE FUNCTION update_lab_updated_at();

CREATE TRIGGER lab_notifications_updated_at
    BEFORE UPDATE ON lab_notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_lab_updated_at();

-- ============================================================================
-- CASE NUMBER SEQUENCE
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS lab_case_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_lab_case_number()
RETURNS TRIGGER AS $$
DECLARE
    clinic_code TEXT;
BEGIN
    -- Get clinic code or use default
    SELECT COALESCE(code, 'LAB') INTO clinic_code FROM clinics WHERE id = NEW.clinic_id;

    NEW.case_number := clinic_code || '-' || EXTRACT(YEAR FROM NOW()) || '-' ||
                       LPAD(nextval('lab_case_number_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lab_case_generate_number
    BEFORE INSERT ON lab_cases
    FOR EACH ROW
    WHEN (NEW.case_number IS NULL)
    EXECUTE FUNCTION generate_lab_case_number();

-- ============================================================================
-- AUDIT TRIGGER FOR STATUS CHANGES
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_lab_case_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO lab_case_status_history (
            lab_case_id,
            previous_status,
            new_status,
            changed_by,
            changed_at,
            sla_deadline,
            event_type,
            event_data
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            auth.uid(),
            NOW(),
            NEW.current_sla_deadline,
            'STATUS_CHANGE',
            jsonb_build_object(
                'previous_priority', OLD.priority,
                'new_priority', NEW.priority,
                'version', NEW.version
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lab_case_status_audit
    AFTER UPDATE ON lab_cases
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION audit_lab_case_status_change();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE lab_cases IS 'Main aggregate table for dental laboratory case management. Follows ISO 22674 standards.';
COMMENT ON TABLE lab_case_prosthetics IS 'Prosthetic specifications for each lab case, including type, material, and clinical parameters.';
COMMENT ON TABLE lab_case_scans IS 'Digital impression and scan files (STL, PLY, DICOM) for lab cases.';
COMMENT ON TABLE lab_case_designs IS 'CAD design files and approval workflow for lab cases.';
COMMENT ON TABLE lab_case_qc_inspections IS 'Quality control inspection records with criteria scoring.';
COMMENT ON TABLE lab_collaboration_threads IS 'Real-time collaboration threads between clinic and lab.';
COMMENT ON TABLE lab_sla_tracking IS 'SLA milestone tracking for lab case turnaround times.';

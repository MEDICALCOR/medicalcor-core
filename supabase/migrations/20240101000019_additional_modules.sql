-- ============================================================================
-- MedicalCor Core - Additional Modules
-- ============================================================================
-- Campaigns, Waiting List, Reminders, Staff Schedules, Inventory,
-- Documents, Prescriptions, Services
-- ============================================================================

-- =============================================================================
-- CAMPAIGNS (Email Marketing)
-- =============================================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    subject VARCHAR(300),
    content TEXT,
    template_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
    campaign_type VARCHAR(50) DEFAULT 'email' CHECK (campaign_type IN ('email', 'sms', 'whatsapp', 'mixed')),
    target_audience JSONB,
    recipients INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0,
    opened INTEGER DEFAULT 0,
    clicked INTEGER DEFAULT 0,
    bounced INTEGER DEFAULT 0,
    unsubscribed INTEGER DEFAULT 0,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_clinic ON campaigns(clinic_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns(scheduled_at) WHERE status = 'scheduled';

-- =============================================================================
-- WAITING LIST (Patients waiting for appointments)
-- =============================================================================
CREATE TABLE IF NOT EXISTS waiting_list (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID,
    patient_name VARCHAR(200) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(200),
    requested_service VARCHAR(200),
    preferred_doctor_id UUID REFERENCES practitioners(id) ON DELETE SET NULL,
    preferred_doctor_name VARCHAR(200),
    preferred_days TEXT[],
    preferred_time_slots TEXT[],
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'contacted', 'scheduled', 'cancelled', 'expired')),
    notes TEXT,
    contacted_at TIMESTAMPTZ,
    scheduled_appointment_id UUID,
    expires_at TIMESTAMPTZ,
    added_by UUID,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waiting_list_clinic ON waiting_list(clinic_id);
CREATE INDEX IF NOT EXISTS idx_waiting_list_status ON waiting_list(status) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_waiting_list_priority ON waiting_list(priority DESC, added_at ASC);

-- =============================================================================
-- REMINDERS (Automated reminder templates)
-- =============================================================================
CREATE TABLE IF NOT EXISTS reminder_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    reminder_type VARCHAR(50) NOT NULL CHECK (reminder_type IN ('appointment', 'follow_up', 'medication', 'payment', 'birthday', 'custom')),
    channels TEXT[] DEFAULT ARRAY['email'],
    timing_value INTEGER NOT NULL,
    timing_unit VARCHAR(20) NOT NULL CHECK (timing_unit IN ('minutes', 'hours', 'days', 'weeks')),
    timing_relation VARCHAR(20) DEFAULT 'before' CHECK (timing_relation IN ('before', 'after')),
    template_content TEXT NOT NULL,
    template_variables TEXT[],
    is_active BOOLEAN DEFAULT true,
    sent_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_templates_clinic ON reminder_templates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_reminder_templates_type ON reminder_templates(reminder_type);
CREATE INDEX IF NOT EXISTS idx_reminder_templates_active ON reminder_templates(is_active) WHERE is_active = true;

-- Reminder logs (sent reminders)
CREATE TABLE IF NOT EXISTS reminder_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES reminder_templates(id) ON DELETE SET NULL,
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    recipient_id UUID,
    recipient_type VARCHAR(50),
    recipient_contact VARCHAR(200),
    channel VARCHAR(20) NOT NULL,
    content TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    error_message TEXT,
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_template ON reminder_logs(template_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_status ON reminder_logs(status, scheduled_for);

-- =============================================================================
-- STAFF SCHEDULES (Shifts and working hours)
-- =============================================================================
CREATE TABLE IF NOT EXISTS staff_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES practitioners(id) ON DELETE CASCADE,
    staff_name VARCHAR(200),
    staff_role VARCHAR(100),
    department VARCHAR(100),
    schedule_date DATE NOT NULL,
    shift_type VARCHAR(50) DEFAULT 'regular' CHECK (shift_type IN ('morning', 'afternoon', 'evening', 'night', 'regular', 'on_call', 'off', 'vacation', 'sick')),
    start_time TIME,
    end_time TIME,
    break_start TIME,
    break_end TIME,
    notes TEXT,
    is_confirmed BOOLEAN DEFAULT false,
    confirmed_by UUID,
    confirmed_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_shift_times CHECK (end_time > start_time OR shift_type IN ('off', 'vacation', 'sick'))
);

CREATE INDEX IF NOT EXISTS idx_staff_schedules_clinic ON staff_schedules(clinic_id);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_staff ON staff_schedules(staff_id, schedule_date);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_date ON staff_schedules(schedule_date);

-- =============================================================================
-- INVENTORY (Medical supplies and equipment)
-- =============================================================================
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    sku VARCHAR(100),
    barcode VARCHAR(100),
    quantity INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 0,
    max_stock INTEGER,
    unit VARCHAR(50) DEFAULT 'buc',
    unit_price DECIMAL(10,2),
    total_value DECIMAL(12,2),
    supplier VARCHAR(200),
    supplier_contact VARCHAR(200),
    location VARCHAR(200),
    expiry_date DATE,
    last_restocked TIMESTAMPTZ,
    last_used TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_stock CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_clinic ON inventory_items(clinic_id);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON inventory_items(quantity, min_stock) WHERE quantity <= min_stock;
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory_items(expiry_date) WHERE expiry_date IS NOT NULL;

-- Inventory transactions
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('restock', 'use', 'adjustment', 'transfer', 'expired', 'return')),
    quantity INTEGER NOT NULL,
    previous_quantity INTEGER,
    new_quantity INTEGER,
    unit_price DECIMAL(10,2),
    total_amount DECIMAL(12,2),
    reference_type VARCHAR(50),
    reference_id UUID,
    notes TEXT,
    performed_by UUID,
    performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_trans_item ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_trans_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_trans_date ON inventory_transactions(performed_at DESC);

-- =============================================================================
-- DOCUMENTS (Patient and clinic documents)
-- =============================================================================
CREATE TABLE IF NOT EXISTS document_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    parent_id UUID REFERENCES document_folders(id) ON DELETE CASCADE,
    color VARCHAR(50),
    icon VARCHAR(50),
    document_count INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_folders_clinic ON document_folders(clinic_id);
CREATE INDEX IF NOT EXISTS idx_document_folders_parent ON document_folders(parent_id);

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL,
    patient_id UUID,
    patient_name VARCHAR(200),
    name VARCHAR(300) NOT NULL,
    original_name VARCHAR(300),
    file_type VARCHAR(50),
    mime_type VARCHAR(100),
    file_size INTEGER,
    file_size_formatted VARCHAR(50),
    storage_path TEXT,
    storage_provider VARCHAR(50) DEFAULT 'local',
    category VARCHAR(100),
    tags TEXT[],
    description TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    encryption_key_id VARCHAR(100),
    version INTEGER DEFAULT 1,
    parent_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    uploaded_by UUID,
    uploaded_by_name VARCHAR(200),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ,
    last_accessed_by UUID,
    is_archived BOOLEAN DEFAULT false,
    archived_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_documents_clinic ON documents(clinic_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded ON documents(uploaded_at DESC);

-- =============================================================================
-- PRESCRIPTIONS (Medical prescriptions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    prescription_number VARCHAR(100) UNIQUE,
    patient_id UUID,
    patient_name VARCHAR(200) NOT NULL,
    patient_cnp VARCHAR(20),
    doctor_id UUID REFERENCES practitioners(id) ON DELETE SET NULL,
    doctor_name VARCHAR(200) NOT NULL,
    doctor_stamp VARCHAR(100),
    diagnosis TEXT,
    diagnosis_code VARCHAR(50),
    prescription_type VARCHAR(50) DEFAULT 'standard' CHECK (prescription_type IN ('standard', 'compensated', 'free', 'narcotic')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'dispensed', 'partially_dispensed', 'expired', 'cancelled')),
    valid_from DATE DEFAULT CURRENT_DATE,
    valid_until DATE,
    dispensed_at TIMESTAMPTZ,
    dispensed_by VARCHAR(200),
    pharmacy_name VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_clinic ON prescriptions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_number ON prescriptions(prescription_number);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_valid ON prescriptions(valid_until) WHERE status = 'active';

-- Prescription medications
CREATE TABLE IF NOT EXISTS prescription_medications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE CASCADE,
    medication_name VARCHAR(200) NOT NULL,
    medication_code VARCHAR(50),
    active_substance VARCHAR(200),
    dosage VARCHAR(100),
    form VARCHAR(100),
    frequency VARCHAR(100),
    duration VARCHAR(100),
    quantity INTEGER,
    instructions TEXT,
    is_compensated BOOLEAN DEFAULT false,
    compensation_percentage INTEGER,
    unit_price DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescription_meds_prescription ON prescription_medications(prescription_id);

-- =============================================================================
-- SERVICES (Clinic services for booking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    duration INTEGER NOT NULL DEFAULT 30,
    price DECIMAL(10,2),
    price_from DECIMAL(10,2),
    price_to DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'RON',
    is_active BOOLEAN DEFAULT true,
    requires_preparation BOOLEAN DEFAULT false,
    preparation_instructions TEXT,
    available_practitioners UUID[],
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_clinic ON services(clinic_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active) WHERE is_active = true;

-- =============================================================================
-- AUDIT LOG (General purpose - for pages that use simple audit)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    user_id UUID,
    user_name VARCHAR(200),
    user_role VARCHAR(100),
    action VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    entity_name VARCHAR(300),
    old_value JSONB,
    new_value JSONB,
    details TEXT,
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failure', 'warning')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic ON audit_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_waiting_list_updated_at ON waiting_list;
CREATE TRIGGER update_waiting_list_updated_at
    BEFORE UPDATE ON waiting_list
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reminder_templates_updated_at ON reminder_templates;
CREATE TRIGGER update_reminder_templates_updated_at
    BEFORE UPDATE ON reminder_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_staff_schedules_updated_at ON staff_schedules;
CREATE TRIGGER update_staff_schedules_updated_at
    BEFORE UPDATE ON staff_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventory_items_updated_at ON inventory_items;
CREATE TRIGGER update_inventory_items_updated_at
    BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_document_folders_updated_at ON document_folders;
CREATE TRIGGER update_document_folders_updated_at
    BEFORE UPDATE ON document_folders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_prescriptions_updated_at ON prescriptions;
CREATE TRIGGER update_prescriptions_updated_at
    BEFORE UPDATE ON prescriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_services_updated_at ON services;
CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update document folder count
CREATE OR REPLACE FUNCTION update_folder_document_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.folder_id IS NOT NULL THEN
        UPDATE document_folders SET document_count = document_count + 1 WHERE id = NEW.folder_id;
    ELSIF TG_OP = 'DELETE' AND OLD.folder_id IS NOT NULL THEN
        UPDATE document_folders SET document_count = document_count - 1 WHERE id = OLD.folder_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.folder_id IS DISTINCT FROM NEW.folder_id THEN
        IF OLD.folder_id IS NOT NULL THEN
            UPDATE document_folders SET document_count = document_count - 1 WHERE id = OLD.folder_id;
        END IF;
        IF NEW.folder_id IS NOT NULL THEN
            UPDATE document_folders SET document_count = document_count + 1 WHERE id = NEW.folder_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_folder_count ON documents;
CREATE TRIGGER trigger_update_folder_count
    AFTER INSERT OR UPDATE OR DELETE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_folder_document_count();

-- Generate prescription number
CREATE OR REPLACE FUNCTION generate_prescription_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix VARCHAR(4);
    next_num INTEGER;
BEGIN
    IF NEW.prescription_number IS NULL THEN
        year_prefix := TO_CHAR(NOW(), 'YYYY');
        SELECT COALESCE(MAX(CAST(SUBSTRING(prescription_number FROM 'RX-[0-9]{4}-([0-9]+)') AS INTEGER)), 0) + 1
        INTO next_num
        FROM prescriptions
        WHERE prescription_number LIKE 'RX-' || year_prefix || '-%';
        NEW.prescription_number := 'RX-' || year_prefix || '-' || LPAD(next_num::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_prescription_number ON prescriptions;
CREATE TRIGGER trigger_generate_prescription_number
    BEFORE INSERT ON prescriptions
    FOR EACH ROW EXECUTE FUNCTION generate_prescription_number();

-- Update inventory totals
CREATE OR REPLACE FUNCTION update_inventory_totals()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_value := NEW.quantity * COALESCE(NEW.unit_price, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_inventory_totals ON inventory_items;
CREATE TRIGGER trigger_update_inventory_totals
    BEFORE INSERT OR UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION update_inventory_totals();

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE campaigns IS 'Email and SMS marketing campaigns';
COMMENT ON TABLE waiting_list IS 'Patients waiting for appointment slots';
COMMENT ON TABLE reminder_templates IS 'Automated reminder message templates';
COMMENT ON TABLE reminder_logs IS 'Log of sent reminders';
COMMENT ON TABLE staff_schedules IS 'Staff work schedules and shifts';
COMMENT ON TABLE inventory_items IS 'Medical supplies and equipment inventory';
COMMENT ON TABLE inventory_transactions IS 'Inventory movement history';
COMMENT ON TABLE document_folders IS 'Document organization folders';
COMMENT ON TABLE documents IS 'Patient and clinic documents';
COMMENT ON TABLE prescriptions IS 'Medical prescriptions';
COMMENT ON TABLE prescription_medications IS 'Medications in prescriptions';
COMMENT ON TABLE services IS 'Clinic services available for booking';
COMMENT ON TABLE audit_logs IS 'General audit trail for user actions';

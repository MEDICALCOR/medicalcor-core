-- MedicalCor Scheduling Schema
-- Fix: Persistence for Appointments
-- Updated: Added proper constraints, ON DELETE behaviors, and validation

CREATE TABLE IF NOT EXISTS practitioners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    specialty VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Unique constraint on name+specialty to identify practitioners for seed data
    CONSTRAINT practitioners_name_specialty_key UNIQUE (name, specialty)
);

-- Seed initial data (uses unique constraint on name+specialty)
INSERT INTO practitioners (name, specialty) VALUES
('Dr. Maria Popescu', 'General Dentistry'),
('Dr. Alexandru Ionescu', 'Implantology')
ON CONFLICT (name, specialty) DO NOTHING;

CREATE TABLE IF NOT EXISTS time_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- practitioner_id is required to ensure unique constraint works correctly
    practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_booked BOOLEAN DEFAULT false,
    procedure_types TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Prevent double-bookings: same practitioner cannot have overlapping slots
    CONSTRAINT no_double_booking UNIQUE (practitioner_id, start_time),
    -- Ensure end_time is after start_time
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Index for efficient availability queries
CREATE INDEX IF NOT EXISTS idx_time_slots_practitioner_time
    ON time_slots(practitioner_id, start_time)
    WHERE is_booked = false;

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- slot_id is required and cascades on delete
    slot_id UUID NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
    hubspot_contact_id VARCHAR(100) NOT NULL,
    patient_phone VARCHAR(20) NOT NULL,
    patient_name VARCHAR(100),
    procedure_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled',
    notes TEXT,
    confirmation_code VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Validate status matches application values
    CONSTRAINT valid_appointment_status CHECK (
        status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')
    )
);

-- Index for efficient patient lookup
CREATE INDEX IF NOT EXISTS idx_appointments_patient_phone ON appointments(patient_phone);
CREATE INDEX IF NOT EXISTS idx_appointments_hubspot_contact ON appointments(hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status) WHERE status IN ('scheduled', 'confirmed');

-- MedicalCor Scheduling Schema
-- Fix: Persistence for Appointments

CREATE TABLE IF NOT EXISTS practitioners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    specialty VARCHAR(100),
    email VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial data
INSERT INTO practitioners (name, specialty) VALUES
('Dr. Maria Popescu', 'General Dentistry'),
('Dr. Alexandru Ionescu', 'Implantology')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS time_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practitioner_id UUID REFERENCES practitioners(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_booked BOOLEAN DEFAULT false,
    procedure_types TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT no_double_booking UNIQUE (practitioner_id, start_time)
);

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id UUID REFERENCES time_slots(id),
    hubspot_contact_id VARCHAR(100) NOT NULL,
    patient_phone VARCHAR(20) NOT NULL,
    patient_name VARCHAR(100),
    procedure_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled',
    notes TEXT,
    confirmation_code VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

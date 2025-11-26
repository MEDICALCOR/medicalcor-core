-- =============================================================================
-- Slot Reservations Table
-- Prevents double-booking by temporarily reserving slots during user selection
-- =============================================================================

CREATE TABLE IF NOT EXISTS slot_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id UUID NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
    hubspot_contact_id VARCHAR(50) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'confirmed', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Only one active reservation per slot at a time
    CONSTRAINT unique_active_slot_reservation
        EXCLUDE USING gist (slot_id WITH =)
        WHERE (status = 'active' AND expires_at > NOW())
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_slot_reservations_slot ON slot_reservations(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_reservations_contact ON slot_reservations(hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_slot_reservations_expires ON slot_reservations(expires_at)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_slot_reservations_status ON slot_reservations(status);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_slot_reservation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_slot_reservation_updated ON slot_reservations;
CREATE TRIGGER trg_slot_reservation_updated
    BEFORE UPDATE ON slot_reservations
    FOR EACH ROW
    EXECUTE FUNCTION update_slot_reservation_timestamp();

-- Function to automatically expire old reservations (can be called by cron)
CREATE OR REPLACE FUNCTION expire_stale_reservations()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE slot_reservations
    SET status = 'expired'
    WHERE status = 'active'
    AND expires_at < NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON TABLE slot_reservations IS
    'Temporary slot reservations to prevent double-booking during user selection flow.
     Reservations expire automatically after their expires_at timestamp.
     Use pg_advisory_xact_lock for additional protection during high-concurrency scenarios.';

COMMENT ON FUNCTION expire_stale_reservations IS
    'Marks expired reservations as "expired". Call periodically via cron job.';

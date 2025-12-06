-- ============================================================================
-- MedicalCor Core - NPS Collection Tables (M11 Milestone)
-- ============================================================================
-- Patient Satisfaction / Net Promoter Score collection and analytics
-- ============================================================================

-- =============================================================================
-- NPS Surveys Table
-- Tracks scheduled and completed NPS surveys
-- =============================================================================
CREATE TABLE IF NOT EXISTS nps_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Patient identification
    phone VARCHAR(20) NOT NULL,
    hubspot_contact_id VARCHAR(50),
    patient_id UUID,

    -- Survey metadata
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'responded', 'expired', 'skipped')),
    trigger_type VARCHAR(30) NOT NULL
        CHECK (trigger_type IN ('post_appointment', 'post_treatment', 'periodic', 'post_onboarding', 'manual')),

    -- Related context
    appointment_id UUID,
    procedure_type VARCHAR(100),

    -- Delivery settings
    channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp'
        CHECK (channel IN ('whatsapp', 'sms', 'email', 'web')),
    language VARCHAR(5) NOT NULL DEFAULT 'ro'
        CHECK (language IN ('ro', 'en', 'de')),

    -- Scheduling
    scheduled_for TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,

    -- Response data (populated when responded)
    score INTEGER CHECK (score >= 0 AND score <= 10),
    classification VARCHAR(20) CHECK (classification IN ('promoter', 'passive', 'detractor')),
    feedback TEXT,
    response_latency_minutes INTEGER,

    -- Sentiment analysis (populated after processing)
    sentiment_score DECIMAL(4,3) CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
    detected_themes TEXT[],

    -- Follow-up tracking
    requires_follow_up BOOLEAN DEFAULT FALSE,
    follow_up_priority VARCHAR(20) CHECK (follow_up_priority IN ('critical', 'high', 'medium', 'low')),
    follow_up_reason TEXT,
    follow_up_completed_at TIMESTAMPTZ,
    follow_up_completed_by VARCHAR(100),
    follow_up_notes TEXT,

    -- Skip reason (if skipped)
    skip_reason VARCHAR(50),
    skip_details TEXT,

    -- Audit
    correlation_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_nps_surveys_phone ON nps_surveys(phone);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_hubspot_contact_id ON nps_surveys(hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_status ON nps_surveys(status);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_scheduled_for ON nps_surveys(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_responded_at ON nps_surveys(responded_at DESC);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_score ON nps_surveys(score) WHERE score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nps_surveys_classification ON nps_surveys(classification) WHERE classification IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nps_surveys_requires_follow_up ON nps_surveys(requires_follow_up) WHERE requires_follow_up = TRUE;
CREATE INDEX IF NOT EXISTS idx_nps_surveys_trigger_type ON nps_surveys(trigger_type);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_appointment_id ON nps_surveys(appointment_id);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_created_at ON nps_surveys(created_at DESC);

-- =============================================================================
-- NPS Daily Aggregates (Materialized View for Analytics)
-- Pre-computed daily NPS metrics for fast dashboard queries
-- =============================================================================
CREATE TABLE IF NOT EXISTS nps_daily_aggregates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL UNIQUE,

    -- Response counts
    total_surveys_sent INTEGER DEFAULT 0,
    total_responses INTEGER DEFAULT 0,
    promoter_count INTEGER DEFAULT 0,
    passive_count INTEGER DEFAULT 0,
    detractor_count INTEGER DEFAULT 0,

    -- Calculated metrics
    nps_score INTEGER, -- -100 to 100
    response_rate DECIMAL(5,2), -- percentage
    average_score DECIMAL(3,1), -- 0-10

    -- By trigger type
    post_appointment_count INTEGER DEFAULT 0,
    post_treatment_count INTEGER DEFAULT 0,
    periodic_count INTEGER DEFAULT 0,

    -- By channel
    whatsapp_responses INTEGER DEFAULT 0,
    sms_responses INTEGER DEFAULT 0,
    email_responses INTEGER DEFAULT 0,

    -- Follow-ups
    follow_ups_required INTEGER DEFAULT 0,
    follow_ups_completed INTEGER DEFAULT 0,

    -- Timing metrics
    avg_response_latency_minutes INTEGER,

    -- Audit
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nps_daily_aggregates_date ON nps_daily_aggregates(date DESC);

-- =============================================================================
-- NPS Feedback Themes (for theme analysis)
-- =============================================================================
CREATE TABLE IF NOT EXISTS nps_feedback_themes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    theme_name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL
        CHECK (category IN ('positive', 'negative', 'neutral', 'suggestion')),
    keywords TEXT[] NOT NULL,
    occurrence_count INTEGER DEFAULT 0,
    last_occurrence_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed common themes for dental clinic
INSERT INTO nps_feedback_themes (theme_name, category, keywords) VALUES
    ('staff_friendly', 'positive', ARRAY['prietenos', 'amabil', 'zâmbet', 'friendly', 'kind', 'helpful', 'freundlich']),
    ('professional_care', 'positive', ARRAY['profesionist', 'expert', 'competent', 'professional', 'skilled', 'professionell']),
    ('clean_clinic', 'positive', ARRAY['curat', 'igienă', 'steril', 'clean', 'hygienic', 'sauber']),
    ('short_wait', 'positive', ARRAY['rapid', 'punctual', 'fără așteptare', 'fast', 'on time', 'pünktlich']),
    ('good_communication', 'positive', ARRAY['explicat', 'comunicare', 'înțeles', 'explained', 'clear', 'verständlich']),
    ('pain_management', 'positive', ARRAY['fără durere', 'anestezic', 'confortabil', 'painless', 'comfortable', 'schmerzfrei']),
    ('long_wait', 'negative', ARRAY['așteptare', 'întârziere', 'ore', 'waiting', 'delay', 'late', 'Wartezeit']),
    ('expensive', 'negative', ARRAY['scump', 'preț mare', 'costisitor', 'expensive', 'costly', 'teuer']),
    ('poor_communication', 'negative', ARRAY['nu a explicat', 'confuz', 'did not explain', 'confused', 'nicht erklärt']),
    ('pain_issue', 'negative', ARRAY['durere', 'suferință', 'rău', 'pain', 'hurt', 'Schmerzen']),
    ('scheduling_issue', 'negative', ARRAY['programare', 'anulat', 'scheduling', 'cancelled', 'Termin']),
    ('more_info_needed', 'suggestion', ARRAY['mai multe informații', 'more info', 'mehr Informationen']),
    ('online_booking', 'suggestion', ARRAY['online', 'aplicație', 'app', 'online booking', 'Online-Buchung'])
ON CONFLICT (theme_name) DO NOTHING;

-- =============================================================================
-- NPS Survey Templates (for multi-language support)
-- =============================================================================
CREATE TABLE IF NOT EXISTS nps_survey_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_name VARCHAR(100) NOT NULL UNIQUE,
    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('whatsapp', 'sms', 'email', 'web')),
    language VARCHAR(5) NOT NULL
        CHECK (language IN ('ro', 'en', 'de')),
    trigger_type VARCHAR(30) NOT NULL
        CHECK (trigger_type IN ('post_appointment', 'post_treatment', 'periodic', 'post_onboarding', 'manual')),

    -- Template content
    survey_question TEXT NOT NULL,
    follow_up_question TEXT, -- Asked after score is provided
    thank_you_message TEXT NOT NULL,

    -- WhatsApp template details
    whatsapp_template_id VARCHAR(100),
    whatsapp_template_approved BOOLEAN DEFAULT FALSE,

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default templates
INSERT INTO nps_survey_templates (template_name, channel, language, trigger_type, survey_question, follow_up_question, thank_you_message) VALUES
    -- Romanian templates
    ('nps_post_appointment_ro', 'whatsapp', 'ro', 'post_appointment',
     'Bună {{name}}! Pe o scară de la 0 la 10, cât de probabil este să ne recomandați prietenilor sau familiei? (Răspundeți cu un număr)',
     'Mulțumim pentru feedback! Aveți ceva ce ați dori să ne spuneți despre experiența dumneavoastră?',
     'Vă mulțumim foarte mult pentru feedback! Părerea dumneavoastră ne ajută să ne îmbunătățim.'),
    ('nps_post_treatment_ro', 'whatsapp', 'ro', 'post_treatment',
     'Bună {{name}}! Cum ați evalua tratamentul primit la noi? Pe o scară de la 0 la 10, cât de probabil este să ne recomandați?',
     'Aveți observații despre tratamentul primit?',
     'Vă mulțumim pentru încredere și pentru feedback!'),

    -- English templates
    ('nps_post_appointment_en', 'whatsapp', 'en', 'post_appointment',
     'Hi {{name}}! On a scale of 0-10, how likely are you to recommend us to friends or family? (Reply with a number)',
     'Thank you for your feedback! Is there anything you would like to share about your experience?',
     'Thank you so much for your feedback! Your opinion helps us improve.'),
    ('nps_post_treatment_en', 'whatsapp', 'en', 'post_treatment',
     'Hi {{name}}! How would you rate the treatment you received? On a scale of 0-10, how likely are you to recommend us?',
     'Do you have any comments about your treatment?',
     'Thank you for trusting us and for your feedback!'),

    -- German templates
    ('nps_post_appointment_de', 'whatsapp', 'de', 'post_appointment',
     'Hallo {{name}}! Auf einer Skala von 0-10, wie wahrscheinlich würden Sie uns Freunden oder Familie empfehlen? (Antworten Sie mit einer Zahl)',
     'Vielen Dank für Ihr Feedback! Möchten Sie uns etwas über Ihre Erfahrung mitteilen?',
     'Vielen Dank für Ihr Feedback! Ihre Meinung hilft uns, uns zu verbessern.')
ON CONFLICT (template_name) DO NOTHING;

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to calculate NPS from counts
CREATE OR REPLACE FUNCTION calculate_nps(
    p_promoter_count INTEGER,
    p_passive_count INTEGER,
    p_detractor_count INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_total INTEGER;
    v_promoter_pct DECIMAL;
    v_detractor_pct DECIMAL;
BEGIN
    v_total := p_promoter_count + p_passive_count + p_detractor_count;
    IF v_total = 0 THEN
        RETURN 0;
    END IF;

    v_promoter_pct := (p_promoter_count::DECIMAL / v_total) * 100;
    v_detractor_pct := (p_detractor_count::DECIMAL / v_total) * 100;

    RETURN ROUND(v_promoter_pct - v_detractor_pct)::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to classify NPS score
CREATE OR REPLACE FUNCTION classify_nps_score(p_score INTEGER)
RETURNS VARCHAR(20) AS $$
BEGIN
    IF p_score >= 9 THEN
        RETURN 'promoter';
    ELSIF p_score >= 7 THEN
        RETURN 'passive';
    ELSE
        RETURN 'detractor';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to refresh daily NPS aggregates
CREATE OR REPLACE FUNCTION refresh_nps_daily_aggregate(p_date DATE)
RETURNS VOID AS $$
DECLARE
    v_stats RECORD;
BEGIN
    -- Calculate aggregates for the date
    SELECT
        COUNT(*) FILTER (WHERE status = 'sent' OR status = 'responded' OR status = 'expired') as total_sent,
        COUNT(*) FILTER (WHERE status = 'responded') as total_responses,
        COUNT(*) FILTER (WHERE classification = 'promoter') as promoters,
        COUNT(*) FILTER (WHERE classification = 'passive') as passives,
        COUNT(*) FILTER (WHERE classification = 'detractor') as detractors,
        COUNT(*) FILTER (WHERE trigger_type = 'post_appointment' AND status = 'responded') as post_appt,
        COUNT(*) FILTER (WHERE trigger_type = 'post_treatment' AND status = 'responded') as post_treat,
        COUNT(*) FILTER (WHERE trigger_type = 'periodic' AND status = 'responded') as periodic,
        COUNT(*) FILTER (WHERE channel = 'whatsapp' AND status = 'responded') as wa_responses,
        COUNT(*) FILTER (WHERE channel = 'sms' AND status = 'responded') as sms_responses,
        COUNT(*) FILTER (WHERE channel = 'email' AND status = 'responded') as email_responses,
        COUNT(*) FILTER (WHERE requires_follow_up = TRUE) as follow_ups_req,
        COUNT(*) FILTER (WHERE follow_up_completed_at IS NOT NULL) as follow_ups_done,
        AVG(response_latency_minutes) FILTER (WHERE response_latency_minutes IS NOT NULL) as avg_latency,
        AVG(score) FILTER (WHERE score IS NOT NULL) as avg_score
    INTO v_stats
    FROM nps_surveys
    WHERE DATE(created_at) = p_date;

    -- Upsert the aggregate
    INSERT INTO nps_daily_aggregates (
        date,
        total_surveys_sent,
        total_responses,
        promoter_count,
        passive_count,
        detractor_count,
        nps_score,
        response_rate,
        average_score,
        post_appointment_count,
        post_treatment_count,
        periodic_count,
        whatsapp_responses,
        sms_responses,
        email_responses,
        follow_ups_required,
        follow_ups_completed,
        avg_response_latency_minutes,
        computed_at
    ) VALUES (
        p_date,
        v_stats.total_sent,
        v_stats.total_responses,
        v_stats.promoters,
        v_stats.passives,
        v_stats.detractors,
        calculate_nps(v_stats.promoters, v_stats.passives, v_stats.detractors),
        CASE WHEN v_stats.total_sent > 0
             THEN (v_stats.total_responses::DECIMAL / v_stats.total_sent) * 100
             ELSE 0 END,
        v_stats.avg_score,
        v_stats.post_appt,
        v_stats.post_treat,
        v_stats.periodic,
        v_stats.wa_responses,
        v_stats.sms_responses,
        v_stats.email_responses,
        v_stats.follow_ups_req,
        v_stats.follow_ups_done,
        v_stats.avg_latency,
        NOW()
    )
    ON CONFLICT (date) DO UPDATE SET
        total_surveys_sent = EXCLUDED.total_surveys_sent,
        total_responses = EXCLUDED.total_responses,
        promoter_count = EXCLUDED.promoter_count,
        passive_count = EXCLUDED.passive_count,
        detractor_count = EXCLUDED.detractor_count,
        nps_score = EXCLUDED.nps_score,
        response_rate = EXCLUDED.response_rate,
        average_score = EXCLUDED.average_score,
        post_appointment_count = EXCLUDED.post_appointment_count,
        post_treatment_count = EXCLUDED.post_treatment_count,
        periodic_count = EXCLUDED.periodic_count,
        whatsapp_responses = EXCLUDED.whatsapp_responses,
        sms_responses = EXCLUDED.sms_responses,
        email_responses = EXCLUDED.email_responses,
        follow_ups_required = EXCLUDED.follow_ups_required,
        follow_ups_completed = EXCLUDED.follow_ups_completed,
        avg_response_latency_minutes = EXCLUDED.avg_response_latency_minutes,
        computed_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to check if patient can receive NPS survey (frequency limiting)
CREATE OR REPLACE FUNCTION can_send_nps_survey(
    p_phone VARCHAR(20),
    p_min_days_between_surveys INTEGER DEFAULT 30
) RETURNS BOOLEAN AS $$
DECLARE
    v_last_survey_date DATE;
BEGIN
    -- Get the date of the last survey sent to this phone
    SELECT DATE(created_at) INTO v_last_survey_date
    FROM nps_surveys
    WHERE phone = p_phone
      AND status IN ('sent', 'responded')
    ORDER BY created_at DESC
    LIMIT 1;

    -- If no previous survey, allow
    IF v_last_survey_date IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Check if enough days have passed
    RETURN (CURRENT_DATE - v_last_survey_date) >= p_min_days_between_surveys;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Triggers
-- =============================================================================

-- Trigger to update updated_at on nps_surveys
CREATE OR REPLACE FUNCTION update_nps_surveys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_nps_surveys_updated_at ON nps_surveys;
CREATE TRIGGER trg_update_nps_surveys_updated_at
    BEFORE UPDATE ON nps_surveys
    FOR EACH ROW
    EXECUTE FUNCTION update_nps_surveys_updated_at();

-- Trigger to auto-classify score when set
CREATE OR REPLACE FUNCTION auto_classify_nps_score()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.score IS NOT NULL AND NEW.classification IS NULL THEN
        NEW.classification = classify_nps_score(NEW.score);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_classify_nps_score ON nps_surveys;
CREATE TRIGGER trg_auto_classify_nps_score
    BEFORE INSERT OR UPDATE OF score ON nps_surveys
    FOR EACH ROW
    EXECUTE FUNCTION auto_classify_nps_score();

-- Trigger to auto-set requires_follow_up for detractors
CREATE OR REPLACE FUNCTION auto_set_follow_up_required()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.score IS NOT NULL AND NEW.score <= 6 THEN
        NEW.requires_follow_up = TRUE;
        NEW.follow_up_priority = CASE
            WHEN NEW.score <= 3 THEN 'critical'
            WHEN NEW.score <= 5 THEN 'high'
            ELSE 'medium'
        END;
        NEW.follow_up_reason = 'Detractor score requires follow-up';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_set_follow_up_required ON nps_surveys;
CREATE TRIGGER trg_auto_set_follow_up_required
    BEFORE INSERT OR UPDATE OF score ON nps_surveys
    FOR EACH ROW
    EXECUTE FUNCTION auto_set_follow_up_required();

-- =============================================================================
-- Views
-- =============================================================================

-- View for NPS summary statistics
CREATE OR REPLACE VIEW nps_summary_stats AS
SELECT
    COUNT(*) FILTER (WHERE status = 'responded') as total_responses,
    COUNT(*) FILTER (WHERE classification = 'promoter') as promoter_count,
    COUNT(*) FILTER (WHERE classification = 'passive') as passive_count,
    COUNT(*) FILTER (WHERE classification = 'detractor') as detractor_count,
    calculate_nps(
        COUNT(*) FILTER (WHERE classification = 'promoter')::INTEGER,
        COUNT(*) FILTER (WHERE classification = 'passive')::INTEGER,
        COUNT(*) FILTER (WHERE classification = 'detractor')::INTEGER
    ) as nps_score,
    ROUND(AVG(score) FILTER (WHERE score IS NOT NULL), 1) as average_score,
    ROUND(
        (COUNT(*) FILTER (WHERE status = 'responded')::DECIMAL /
         NULLIF(COUNT(*) FILTER (WHERE status IN ('sent', 'responded', 'expired')), 0)) * 100,
        1
    ) as response_rate
FROM nps_surveys
WHERE created_at >= NOW() - INTERVAL '30 days';

-- View for recent detractors requiring follow-up
CREATE OR REPLACE VIEW nps_pending_follow_ups AS
SELECT
    id,
    phone,
    hubspot_contact_id,
    score,
    classification,
    feedback,
    follow_up_priority,
    follow_up_reason,
    procedure_type,
    responded_at,
    created_at
FROM nps_surveys
WHERE requires_follow_up = TRUE
  AND follow_up_completed_at IS NULL
ORDER BY
    CASE follow_up_priority
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
    END,
    responded_at ASC;

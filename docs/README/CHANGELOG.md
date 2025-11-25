# Changelog

All notable changes to MedicalCor Core will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive README documentation folder
- State-of-the-art documentation structure

---

## [0.1.0] - 2024-XX-XX

### Added

#### Core Platform
- AI-powered lead scoring with GPT-4o integration
- Rule-based scoring fallback when AI is unavailable
- Multi-channel communication support (WhatsApp, Voice, Email, Web)
- Durable workflow processing with Trigger.dev
- Event sourcing architecture for complete audit trails

#### Applications
- **apps/api**: Fastify webhook gateway with signature verification
- **apps/trigger**: Trigger.dev durable workflows and cron jobs
- **apps/web**: Next.js 15 admin dashboard with React 19

#### Packages
- **@medicalcor/core**: Logger, errors, auth, event store, circuit breaker
- **@medicalcor/types**: Consolidated Zod schemas (single source of truth)
- **@medicalcor/domain**: Scoring, triage, scheduling, consent services
- **@medicalcor/integrations**: HubSpot, WhatsApp, OpenAI, Stripe, Vapi clients

#### Security
- HMAC-SHA256 webhook signature verification for all providers
- Timing-safe comparison to prevent timing attacks
- Rate limiting with Redis backend
- CORS validation with origin allowlist
- Helmet.js security headers
- PII redaction in logs
- No signature bypass in any environment

#### GDPR Compliance
- Consent management with multiple consent types
- Consent audit logging
- 2-year consent expiry with renewal flow
- Data processor registry
- Right to erasure support

#### Infrastructure
- Docker Compose for local development
- PostgreSQL 15 for data persistence
- Redis 7 for caching and rate limiting
- OpenTelemetry observability
- Prometheus + Grafana monitoring (optional profile)
- Cloudflare tunnel for webhook testing (optional profile)

#### CI/CD
- GitHub Actions for continuous integration
- Dependency vulnerability scanning
- License compliance checking
- Docker multi-arch builds (amd64, arm64)
- Codecov integration
- E2E tests with Playwright

#### Integrations
- **HubSpot**: Contact sync, timeline events, task creation
- **WhatsApp (360dialog)**: Message sending, template delivery
- **Twilio**: Voice calls, SMS
- **Vapi**: Voice AI integration
- **OpenAI**: GPT-4o for lead scoring
- **Stripe**: Payment processing

#### Workflows
- `lead-scoring-workflow`: AI-powered lead scoring with enrichment
- `patient-journey-workflow`: End-to-end patient lifecycle
- `booking-agent-workflow`: Intelligent appointment booking
- `voice-transcription-workflow`: Call transcription and analysis

#### Cron Jobs
- Daily recall check (09:00)
- Hourly appointment reminders
- Nightly lead scoring refresh (02:00)
- Weekly analytics report (Monday 08:00)
- Weekly stale lead cleanup (Sunday 03:00)
- Daily GDPR consent audit (04:00)

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 0.1.0 | TBD | Initial release with core CRM functionality |

---

## Migration Guides

### Migrating to 0.1.0

This is the initial release. No migration required.

---

## Deprecation Notices

No deprecations at this time.

---

## Security Advisories

No security advisories at this time.

Report security issues to: security@medicalcor.com

---

## Release Schedule

We follow a continuous delivery model:

- **Patch releases**: As needed for bug fixes
- **Minor releases**: Monthly for new features
- **Major releases**: As needed for breaking changes

---

## Contributing to Changelog

When making changes:

1. Add entry under `[Unreleased]` section
2. Categorize as: Added, Changed, Deprecated, Removed, Fixed, Security
3. Include PR/issue reference when applicable
4. Keep entries concise but informative

Example entry:
```markdown
### Added
- Lead scoring confidence threshold configuration (#123)
```

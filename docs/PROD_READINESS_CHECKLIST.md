# Production Readiness Checklist

## MedicalCor Core Platform

**Versiune:** 1.0
**Data:** Decembrie 2024
**Utilizare:** Verificare pre-release si audit periodic

---

## Cum se foloseste acest checklist

1. **Pre-Release:** Completeaza toate sectiunile inainte de orice deploy in productie
2. **Audit periodic:** Revizuieste lunar pentru a mentine conformitatea
3. **Incident review:** Verifica sectiunile relevante dupa orice incident

**Legenda:**

- `[x]` - Completat si verificat
- `[ ]` - In asteptare
- `[!]` - Necesita atentie imediata
- `[~]` - Partial completat

---

## 1. Arhitectura & Cod

### 1.1 Structura Hexagonala (DDD)

| Check | Item                                          | Locatie                    |
| ----- | --------------------------------------------- | -------------------------- |
| [ ]   | Domain layer izolat (fara dependinte externe) | `packages/domain/`         |
| [ ]   | Application layer defineste use case-uri      | `packages/application/`    |
| [ ]   | Infrastructure adapters separati              | `packages/infrastructure/` |
| [ ]   | Core utilities partajate corect               | `packages/core/`           |
| [ ]   | Types/schemas centralizate                    | `packages/types/`          |
| [ ]   | Integrations izolate de domain                | `packages/integrations/`   |

### 1.2 CQRS & Event Sourcing

| Check | Item                                     | Verificare                                   |
| ----- | ---------------------------------------- | -------------------------------------------- |
| [ ]   | Event store implementat si functional    | Test: `pnpm test --filter @medicalcor/core`  |
| [ ]   | Projections actualizate < 30s            | Metric: `medicalcor_projection_lag_seconds`  |
| [ ]   | Outbox pattern pentru evenimente critice | Verifica DLQ: `medicalcor_dlq_pending_total` |
| [ ]   | Event replay testat                      | DR test: `npm run test:dr`                   |

### 1.3 AI Gateway

| Check | Item                               | Verificare                                 |
| ----- | ---------------------------------- | ------------------------------------------ |
| [ ]   | Multi-provider fallback configurat | `packages/core/src/ai-gateway/`            |
| [ ]   | Budget controller activ            | Dashboard: AI Gateway Metrics              |
| [ ]   | Rate limiting per provider         | Config: env vars                           |
| [ ]   | Circuit breaker functional         | Metric: `medicalcor_circuit_breaker_state` |

### 1.4 Calitate Cod

| Check | Item                        | Comanda                   |
| ----- | --------------------------- | ------------------------- |
| [ ]   | Zero erori TypeScript       | `pnpm typecheck`          |
| [ ]   | Zero erori ESLint           | `pnpm lint`               |
| [ ]   | Formatare consistenta       | `pnpm format:check`       |
| [ ]   | Fara `any` types in cod nou | `grep -r "any" packages/` |
| [ ]   | Cyclomatic complexity < 15  | ESLint rule               |

---

## 2. Securitate

### 2.1 Autentificare & Autorizare

| Check | Item                         | Verificare                     |
| ----- | ---------------------------- | ------------------------------ |
| [ ]   | JWT validation activa        | Config: `JWT_SECRET` setat     |
| [ ]   | Token expiration configurata | Default: 1h access, 7d refresh |
| [ ]   | RBAC implementat corect      | `packages/core/src/security/`  |
| [ ]   | Session management securizat | Redis-backed sessions          |

### 2.2 Date & Privacy

| Check | Item                                     | Locatie                                 |
| ----- | ---------------------------------------- | --------------------------------------- |
| [ ]   | RLS (Row Level Security) activ           | `infra/migrations/005-security-rls.sql` |
| [ ]   | PII redaction in logs                    | `packages/core/src/logger/`             |
| [ ]   | GDPR consent tracking                    | `packages/core/src/security/gdpr/`      |
| [ ]   | Encryption at rest pentru date sensibile | Supabase encryption                     |
| [ ]   | TLS obligatoriu pentru toate conexiunile | Infra config                            |

### 2.3 Secreturi & Credentiale

| Check | Item                                | Verificare                       |
| ----- | ----------------------------------- | -------------------------------- |
| [ ]   | Niciun secret in cod                | `pnpm secrets-scan` sau GitLeaks |
| [ ]   | `.env.example` actualizat           | Verifica manual                  |
| [ ]   | Toate secreturile in secret manager | GCP Secret Manager / Vault       |
| [ ]   | Rotatia secreturilor documentata    | `docs/SECURITY.md`               |

### 2.4 Webhook Security

| Check | Item                            | Secret Var                |
| ----- | ------------------------------- | ------------------------- |
| [ ]   | WhatsApp signature verification | `WHATSAPP_WEBHOOK_SECRET` |
| [ ]   | Stripe signature verification   | `STRIPE_WEBHOOK_SECRET`   |
| [ ]   | Vapi signature verification     | `VAPI_WEBHOOK_SECRET`     |
| [ ]   | Rate limiting pe webhooks       | Config Fastify            |

### 2.5 Dependency Security

| Check | Item                         | Comanda               |
| ----- | ---------------------------- | --------------------- |
| [ ]   | Zero vulnerabilitati critice | `pnpm audit`          |
| [ ]   | Dependinte actualizate       | `pnpm outdated`       |
| [ ]   | License compliance           | CI: license-check job |

---

## 3. Observabilitate

### 3.1 Logging

| Check | Item                            | Verificare                 |
| ----- | ------------------------------- | -------------------------- |
| [ ]   | Structured JSON logging         | Logger config              |
| [ ]   | PII redaction activa            | Test cu date reale         |
| [ ]   | Log levels corecte per env      | `LOG_LEVEL` env var        |
| [ ]   | Correlation ID propagat         | Header: `X-Correlation-ID` |
| [ ]   | Fara `console.log` in productie | ESLint rule                |

### 3.2 Tracing

| Check | Item                          | Verificare                      |
| ----- | ----------------------------- | ------------------------------- |
| [ ]   | OpenTelemetry initializat     | `apps/*/src/instrumentation.ts` |
| [ ]   | Trace propagation functional  | Test end-to-end                 |
| [ ]   | Spans pentru operatii critice | AI, DB, external calls          |
| [ ]   | Tempo/Jaeger conectat         | `OTEL_EXPORTER_OTLP_ENDPOINT`   |

### 3.3 Metrici

| Check | Item                              | Verificare                       |
| ----- | --------------------------------- | -------------------------------- |
| [ ]   | Endpoint `/metrics` expus         | `curl localhost:3000/metrics`    |
| [ ]   | Prometheus scraping configurat    | `infra/prometheus/`              |
| [ ]   | Custom metrics definite           | `apps/api/src/routes/metrics.ts` |
| [ ]   | Dashboard-uri Grafana functionale | `infra/grafana/dashboards/`      |

### 3.4 Alertare

| Check | Item                        | Verificare                       |
| ----- | --------------------------- | -------------------------------- |
| [ ]   | Alerte critice configurate  | Vezi `docs/README/MONITORING.md` |
| [ ]   | PagerDuty/Slack integration | Alertmanager config              |
| [ ]   | Escalation path definit     | Runbooks                         |
| [ ]   | Alert fatigue minimizat     | Review alert frequency           |

---

## 4. Testare

### 4.1 Unit Tests

| Check | Item                           | Comanda              |
| ----- | ------------------------------ | -------------------- |
| [ ]   | Coverage > 70% packages/domain | `pnpm test:coverage` |
| [ ]   | Coverage > 60% packages/core   | `pnpm test:coverage` |
| [ ]   | Toate testele trec             | `pnpm test`          |

### 4.2 Integration Tests

| Check | Item                    | Comanda                  |
| ----- | ----------------------- | ------------------------ |
| [ ]   | API routes testate      | `pnpm --filter api test` |
| [ ]   | Database integration OK | Test cu DB reala         |
| [ ]   | External service mocks  | MSW configurate          |

### 4.3 E2E Tests

| Check | Item                                                     | Comanda                                      |
| ----- | -------------------------------------------------------- | -------------------------------------------- |
| [ ]   | Critical flows testate                                   | `pnpm test:e2e`                              |
| [ ]   | Playwright configurat                                    | `apps/web/e2e/`                              |
| [ ]   | Test user credentials configured                         | See [E2E Setup Guide](./README/E2E_SETUP.md) |
| [ ]   | GitHub Secrets set (TEST_USER_EMAIL, TEST_USER_PASSWORD) | Repository Settings → Secrets                |
| [ ]   | CI E2E passing                                           | GitHub Actions                               |

### 4.4 Load Testing

| Check | Item                      | Verificare       |
| ----- | ------------------------- | ---------------- |
| [ ]   | Load test executat        | k6 sau Artillery |
| [ ]   | P99 latency < 1s la load  | Test results     |
| [ ]   | Error rate < 0.1% la load | Test results     |
| [ ]   | Auto-scaling testat       | Cloud Run config |

### 4.5 DR Testing

| Check | Item                   | Comanda             |
| ----- | ---------------------- | ------------------- |
| [ ]   | Backup/restore testat  | `npm run test:dr`   |
| [ ]   | RTO < 15 min verificat | DR exercise results |
| [ ]   | RPO < 60 min verificat | DR exercise results |

---

## 5. Infrastructura

### 5.1 Terraform/IaC

| Check | Item                                     | Locatie              |
| ----- | ---------------------------------------- | -------------------- |
| [ ]   | State file securizat                     | Remote backend (GCS) |
| [ ]   | `terraform plan` clean                   | `infra/terraform/`   |
| [ ]   | Environments separate (dev/staging/prod) | Workspaces           |

### 5.2 Container & Deploy

| Check | Item                          | Verificare                   |
| ----- | ----------------------------- | ---------------------------- |
| [ ]   | Dockerfile optimizat          | Multi-stage build            |
| [ ]   | Image vulnerabilities scanate | Trivy in CI                  |
| [ ]   | Health checks configurate     | `/health`, `/ready`, `/live` |
| [ ]   | Resource limits setate        | K8s/Cloud Run config         |

### 5.3 Database

| Check | Item                          | Verificare               |
| ----- | ----------------------------- | ------------------------ |
| [ ]   | Migrations up-to-date         | `pnpm db:migrate:status` |
| [ ]   | Backup schedule activ         | Cloud SQL config         |
| [ ]   | Point-in-time recovery activ  | PITR enabled             |
| [ ]   | Connection pooling configurat | PgBouncer sau Supabase   |

### 5.4 CI/CD

| Check | Item                        | Verificare                  |
| ----- | --------------------------- | --------------------------- |
| [ ]   | Pipeline complet functional | `.github/workflows/ci.yml`  |
| [ ]   | Branch protection activa    | `docs/BRANCH_PROTECTION.md` |
| [ ]   | Canary/Blue-Green deploy    | Cloud Run traffic split     |
| [ ]   | Rollback testat             | Manual verification         |

---

## 6. Documentatie

### 6.1 Tehnica

| Check | Item                          | Locatie                        |
| ----- | ----------------------------- | ------------------------------ |
| [ ]   | README actualizat             | `README.md`                    |
| [ ]   | API reference documentat      | `docs/README/API_REFERENCE.md` |
| [ ]   | Architecture decision records | `docs/adr/`                    |
| [ ]   | Runbooks pentru incidente     | `docs/DR-PROCEDURES.md`        |

### 6.2 Operationala

| Check | Item                  | Locatie                          |
| ----- | --------------------- | -------------------------------- |
| [ ]   | Deployment guide      | `docs/README/DEPLOYMENT.md`      |
| [ ]   | Configuration guide   | `docs/README/CONFIGURATION.md`   |
| [ ]   | Troubleshooting guide | `docs/README/TROUBLESHOOTING.md` |
| [ ]   | On-call procedures    | `docs/DR-PROCEDURES.md`          |

---

## 7. Operare

### 7.1 On-Call

| Check | Item                      | Verificare              |
| ----- | ------------------------- | ----------------------- |
| [ ]   | On-call rotation definita | PagerDuty schedule      |
| [ ]   | Escalation policy clara   | Contact list in DR docs |
| [ ]   | Runbooks accesibile       | `docs/` folder          |
| [ ]   | Alert acknowledgment SLA  | < 5 min pentru critice  |

### 7.2 Monitoring

| Check | Item                  | Verificare                  |
| ----- | --------------------- | --------------------------- |
| [ ]   | SLI-uri definite      | `docs/SLI_DEFINITION.md`    |
| [ ]   | SLO-uri stabilite     | Dashboard thresholds        |
| [ ]   | Error budget tracking | Grafana panel               |
| [ ]   | Capacity planning     | Resource utilization review |

---

## 8. Compliance (HIPAA/GDPR)

### 8.1 Data Handling

| Check | Item                            | Verificare            |
| ----- | ------------------------------- | --------------------- |
| [ ]   | Data classification documentata | Security docs         |
| [ ]   | Retention policies implementate | DB migrations         |
| [ ]   | Data deletion capability        | GDPR right to erasure |
| [ ]   | Audit trail complet             | Audit logs            |

### 8.2 Access Control

| Check | Item                      | Verificare        |
| ----- | ------------------------- | ----------------- |
| [ ]   | Least privilege principle | IAM review        |
| [ ]   | Access logs activi        | Cloud Audit Logs  |
| [ ]   | Regular access reviews    | Quarterly process |

---

## Sign-off

| Rol           | Nume | Data | Semnatura |
| ------------- | ---- | ---- | --------- |
| Tech Lead     |      |      |           |
| Security      |      |      |           |
| DevOps/SRE    |      |      |           |
| Product Owner |      |      |           |

---

## Revision History

| Versiune | Data     | Autor         | Modificari       |
| -------- | -------- | ------------- | ---------------- |
| 1.0      | Dec 2024 | Platform Team | Initial document |

---

_Checklist pentru MedicalCor Core Platform - Decembrie 2024_

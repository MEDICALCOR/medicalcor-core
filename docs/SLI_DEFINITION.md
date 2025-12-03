# Service Level Indicators (SLI) Definition

## MedicalCor Core Platform

**Versiune:** 1.0
**Data:** Decembrie 2024
**Status:** Activ

---

## Prezentare Generala

Acest document defineste **Service Level Indicators (SLI)** pentru platforma MedicalCor Core. Fiecare SLI reprezinta o masura obiectiva a comportamentului sistemului, utilizata pentru calculul SLO-urilor si declansarea alertelor.

**Principiu fundamental:** Un SLI masoara ceea ce utilizatorul experimenta, nu ceea ce credem noi ca se intampla.

---

## 1. API Gateway (Fastify)

### 1.1 Request Success Rate

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Procentul de request-uri HTTP completate cu succes (2xx/3xx) |
| **Tip** | Availability |
| **Metrica Prometheus** | `http_requests_total` |
| **Formula** | `sum(rate(http_requests_total{status=~"2..\\|3.."}[5m])) / sum(rate(http_requests_total[5m]))` |
| **Granularitate** | Per ruta, per metoda HTTP |
| **Sursa** | `apps/api/src/instrumentation.ts` (OpenTelemetry auto-instrumentation) |

### 1.2 Request Latency (P95/P99)

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Timpul de raspuns pentru request-uri HTTP |
| **Tip** | Latency |
| **Metrica Prometheus** | `http_request_duration_seconds_bucket` |
| **Formula P95** | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` |
| **Formula P99** | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` |
| **Rute critice** | `/webhooks/*`, `/api/leads/*`, `/api/scoring/*` |

### 1.3 Error Rate (5xx)

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Procentul de erori server |
| **Tip** | Reliability |
| **Metrica Prometheus** | `http_requests_total{status=~"5.."}` |
| **Formula** | `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` |
| **Threshold critic** | > 0.5% pentru 5 minute |

---

## 2. Lead Scoring Engine

### 2.1 Scoring Success Rate

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Procentul de operatiuni de scoring finalizate cu succes |
| **Tip** | Availability |
| **Metrica Prometheus** | `medicalcor_leads_scored_total` |
| **Labels** | `classification` (HOT/WARM/COLD), `channel` (whatsapp/voice/web) |
| **Sursa** | `apps/api/src/routes/metrics.ts:48` |

### 2.2 Scoring Latency

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Durata operatiunii de scoring per lead |
| **Tip** | Latency |
| **Metrica Prometheus** | `medicalcor_lead_scoring_duration_seconds` |
| **Labels** | `classification`, `channel`, `status` |
| **Buckets** | `[0.1, 0.5, 1, 2, 5, 10]` secunde |
| **Sursa** | `apps/api/src/routes/metrics.ts:36` |

### 2.3 Classification Distribution

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Distributia lead-urilor pe clasificari |
| **Tip** | Quality |
| **Formula HOT** | `sum(medicalcor_leads_scored_total{classification="HOT"}) / sum(medicalcor_leads_scored_total)` |
| **Utilizare** | Detectarea anomaliilor in model (drift) |

---

## 3. AI Gateway (Multi-Provider)

### 3.1 AI Function Call Success Rate

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Procentul de apeluri AI finalizate cu succes |
| **Tip** | Availability |
| **Metrica Prometheus** | `medicalcor_ai_function_calls_total` |
| **Labels** | `function_name`, `status` (success/error/timeout) |
| **Sursa** | `apps/api/src/routes/metrics.ts:126` |

### 3.2 AI Token Consumption

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Tokeni AI consumati |
| **Tip** | Cost/Capacity |
| **Metrica Prometheus** | `medicalcor_ai_tokens_used_total` |
| **Labels** | `model` (gpt-4o, gpt-4o-mini), `type` (input/output) |
| **Sursa** | `apps/api/src/routes/metrics.ts:137` |

### 3.3 AI Daily Spend

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Costul zilnic AI in USD |
| **Tip** | Cost |
| **Metrica Prometheus** | `medicalcor_ai_daily_spend_usd` |
| **Threshold** | $500/zi (soft limit), $750/zi (hard limit) |
| **Dashboard** | `infra/grafana/dashboards/ai-gateway-metrics.json` |

### 3.4 Circuit Breaker State

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Starea circuit breaker-ului per serviciu extern |
| **Tip** | Health |
| **Metrica Prometheus** | `medicalcor_circuit_breaker_state` |
| **Labels** | `service` (openai, hubspot, whatsapp) |
| **Valori** | 0=closed (OK), 1=open (failing), 2=half-open (recovering) |
| **Sursa** | `apps/api/src/routes/metrics.ts:115` |

---

## 4. External Services Integration

### 4.1 External Service Latency

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Durata apelurilor catre servicii externe |
| **Tip** | Latency |
| **Metrica Prometheus** | `medicalcor_external_service_duration_seconds` |
| **Labels** | `service`, `operation`, `status` |
| **Servicii monitorizate** | HubSpot, WhatsApp (360dialog), OpenAI, Vapi |
| **Sursa** | `apps/api/src/routes/metrics.ts:103` |

### 4.2 External Service Error Rate

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Rata de erori per serviciu extern |
| **Tip** | Reliability |
| **Formula** | `sum(rate(medicalcor_external_service_duration_seconds_count{status="error"}[5m])) by (service) / sum(rate(medicalcor_external_service_duration_seconds_count[5m])) by (service)` |

---

## 5. Event Store (CQRS/Event Sourcing)

### 5.1 Events Emitted

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Total evenimente de domeniu emise |
| **Tip** | Throughput |
| **Metrica Prometheus** | `medicalcor_events_total` |
| **Labels** | `event_type` |
| **Sursa** | `apps/api/src/routes/metrics.ts:81` |

### 5.2 Event Store Latency

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Durata operatiunilor pe event store |
| **Tip** | Latency |
| **Metrica Prometheus** | `medicalcor_event_store_duration_seconds` |
| **Labels** | `operation` (append, read, snapshot) |
| **Sursa** | `apps/api/src/routes/metrics.ts:91` |

### 5.3 Projection Lag

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Intarzierea proiectiilor fata de event store |
| **Tip** | Freshness |
| **Metrica Prometheus** | `medicalcor_projection_lag_seconds` |
| **Labels** | `projection_name` |
| **Threshold** | > 30s = warning, > 120s = critical |
| **Sursa** | `apps/api/src/routes/metrics.ts:70` |

---

## 6. Dead Letter Queue (DLQ)

### 6.1 DLQ Pending Messages

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Numarul de mesaje in asteptare in DLQ |
| **Tip** | Queue Health |
| **Metrica Prometheus** | `medicalcor_dlq_pending_total` |
| **Labels** | `webhook_type` |
| **Threshold** | > 10 = warning, > 100 = critical |
| **Sursa** | `apps/api/src/routes/metrics.ts:59` |

---

## 7. Database (PostgreSQL)

### 7.1 Database Availability

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Conectivitate si raspuns la query-uri |
| **Tip** | Availability |
| **Verificare** | Health check endpoint `/ready` |
| **Metrica** | `pg_up` (din postgres_exporter) |

### 7.2 Query Latency

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Timpul de executie pentru query-uri |
| **Tip** | Latency |
| **Sursa** | OpenTelemetry `@opentelemetry/instrumentation-pg` |
| **Threshold P95** | < 100ms pentru query-uri simple |

### 7.3 Connection Pool Utilization

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Procentul de conexiuni utilizate din pool |
| **Tip** | Capacity |
| **Threshold** | > 80% = warning |

---

## 8. Trigger.dev Workers

### 8.1 Job Success Rate

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Procentul de job-uri finalizate cu succes |
| **Tip** | Reliability |
| **Sursa** | Trigger.dev dashboard + custom metrics |
| **Threshold** | > 99% |

### 8.2 Job Processing Latency

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Timpul de procesare per job |
| **Tip** | Latency |
| **Job-uri critice** | `process-lead-scoring`, `sync-hubspot-contact` |

### 8.3 Queue Depth

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Numarul de job-uri in asteptare |
| **Tip** | Queue Health |
| **Threshold** | > 1000 = warning |

---

## 9. Web Application (Next.js)

### 9.1 Page Load Success

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Procentul de pagini servite cu succes |
| **Tip** | Availability |
| **Sursa** | `apps/web/src/instrumentation.ts` |

### 9.2 Core Web Vitals

| Atribut | Valoare |
|---------|---------|
| **LCP** | Largest Contentful Paint < 2.5s |
| **INP** | Interaction to Next Paint < 200ms |
| **CLS** | Cumulative Layout Shift < 0.1 |
| **Sursa** | Web Vitals library + analytics |

---

## 10. Security & Compliance

### 10.1 Authentication Failure Rate

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Procentul de incercari de autentificare esuate |
| **Tip** | Security |
| **Threshold** | > 10% = investigate, > 50% = alert |

### 10.2 Rate Limit Violations

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Numarul de request-uri blocate de rate limiting |
| **Tip** | Security |
| **Metrica** | `rate_limit_hits_total` |

### 10.3 Audit Log Completeness

| Atribut | Valoare |
|---------|---------|
| **Descriere** | Procentul de operatiuni sensibile loggate |
| **Tip** | Compliance |
| **Target** | 100% pentru operatiuni GDPR-relevante |

---

## Dashboard-uri Grafana

| Dashboard | Fisier | SLI-uri acoperite |
|-----------|--------|-------------------|
| API Performance | `infra/grafana/dashboards/api-performance.json` | 1.1, 1.2, 1.3 |
| AI Gateway Metrics | `infra/grafana/dashboards/ai-gateway-metrics.json` | 3.1, 3.2, 3.3, 3.4 |
| Worker Performance | `infra/grafana/dashboards/worker-performance.json` | 8.1, 8.2, 8.3 |
| MedicalCor Overview | `infra/grafana/dashboards/medicalcor-overview.json` | Sumar toate |

---

## Referinte

- **Cod metrici:** `apps/api/src/routes/metrics.ts`
- **Instrumentation:** `apps/api/src/instrumentation.ts`
- **Documentatie monitoring:** `docs/README/MONITORING.md`
- **Grafana dashboards:** `infra/grafana/dashboards/`

---

*Document generat pentru MedicalCor Core Platform - Decembrie 2024*

# Slide 2: Riscurile Principale

## "Provocarile Zilei 2"

> _Chiar si un Ferrari are nevoie de mentenanta. Iata riscurile reziduale dupa fix-urile recente:_

---

## 1. Complexitate Operationala

| Atribut        | Valoare         |
| -------------- | --------------- |
| **Severitate** | Medie           |
| **Status**     | Mitigat Partial |

### Descriere

Aveti multe piese in miscare (Fastify, Next.js, Trigger.dev, Redis, Postgres).
Depanarea unui "Patient Journey" esuat necesita urmarirea prin 3 sisteme diferite.

### Ce Exista (Puncte Forte)

- **OpenTelemetry**: Distributed tracing cu correlation IDs
- **Prometheus**: 25+ metrici de business si tehnice
- **Sentry**: Error tracking cu 10% sampling
- **Health Checks**: 6 endpoint-uri inclusiv circuit breaker status

### Gap Rezidual

- Lipsesc runbook-uri operationale pentru debugging
- Nu exista dashboard Grafana pre-configurat

### Actiune Recomandata

> **Observabilitatea este acum prioritatea #1** - Creati runbook-uri pentru scenariile comune

---

## 2. Fragilitatea Dependentelor Externe

| Atribut        | Valoare              |
| -------------- | -------------------- |
| **Severitate** | Medie                |
| **Status**     | Mitigat Semnificativ |

### Descriere

Daca OpenAI pica sau raspunde greu, "Masinaria de Lead-uri" incetineste.
Exista fallback-uri (ruleBasedScore), dar experienta utilizatorului se degradeaza.

### Mitigari Implementate Recent

#### Adaptive Timeout (`packages/core/src/ai-gateway/adaptive-timeout.ts`)

```
Operatie          | Timeout Vechi | Timeout Nou | Fallback
------------------|---------------|-------------|----------
Scoring           | 60s           | 5s          | Instant
Reply Generation  | 60s           | 10s         | Instant
Language Detection| 60s           | 3s          | Instant
```

#### Multi-Provider Gateway (`packages/core/src/ai-gateway/multi-provider-gateway.ts`)

```
Prioritate | Provider  | Fallback Auto
-----------|-----------|---------------
1          | OpenAI    | Da
2          | Anthropic | Da
3          | Llama     | Da (local)
```

### Gap Rezidual

- Metrici pentru fallback usage (cat de des se activeaza?)
- Notificari UI pentru degradare serviciu

---

## 3. Derapaje la Migrarea Bazei de Date

| Atribut        | Valoare              |
| -------------- | -------------------- |
| **Severitate** | Mica                 |
| **Status**     | Mitigat Semnificativ |

### Descriere

Cu constrangerile complexe din `07-crm-hardening.sql`, asigurarea ca baza de date
locala (Dev) este identica cu cea din Productie necesita o disciplina stricta.

### Mitigari Implementate Recent

#### dbmate Migrations (`db/migrations/`)

```
20241127000001_create_core_tables.sql
20241127000002_add_ai_budget_tracking.sql
```

#### Comenzi Disponibile

```bash
npm run db:migrate        # Aplica migrarile
npm run db:migrate:down   # Rollback ultima migrare
npm run db:migrate:status # Verifica starea
```

#### Schema Validation in CI

- Verificare automata la fiecare PR
- Comparatie schema dev vs productie

### Gap Rezidual

- Documentatie pentru flow-ul de migrare in echipa
- Training pentru utilizarea dbmate

---

## 4. Scalarea Costurilor

| Atribut        | Valoare         |
| -------------- | --------------- |
| **Severitate** | Mica            |
| **Status**     | Mitigat Partial |

### Descriere

Trigger.dev v3 si GPT-4o sunt puternice, dar costurile cresc liniar cu traficul.
Un atac DDoS pe webhook ar putea creste factura OpenAI daca nu exista rate-limiting
inainte de apelul AI.

### Mitigari Implementate

#### Rate Limiting (`apps/api/src/plugins/rate-limit.ts`)

```
Endpoint    | Limit
------------|-------------
Global      | 1000 req/min
WhatsApp    | 200 req/min
Voice       | 100 req/min
AI Execute  | 50 req/min
```

#### AI Budget Controller (`packages/core/src/ai-gateway/ai-budget-controller.ts`)

- Limita zilnica si lunara de cheltuieli
- Alerte la 50%, 75%, 90% din buget

#### Token Estimator (`packages/core/src/ai-gateway/token-estimator.ts`)

- Estimare cost inainte de apel
- Refuz request daca depaseste bugetul

### Gap Rezidual

- Integrarea completa a `UserRateLimiter` in toate endpoint-urile
- Dashboard pentru monitorizare costuri in timp real

---

## Sumar Executiv

| Risc                      | Severitate | Inainte    | Dupa Mitigari |
| ------------------------- | ---------- | ---------- | ------------- |
| Complexitate Operationala | Medie      | Gap mare   | Gap mic       |
| Dependente Externe        | Medie      | Critic     | Controlat     |
| Migrari DB                | Mica       | Riscant    | Disciplinat   |
| Scalare Costuri           | Mica       | Vulnerabil | Protejat      |

### Prioritati Imediate

1. **Runbook-uri operationale** - pentru debugging Patient Journey
2. **Dashboard costuri AI** - vizibilitate in timp real
3. **Training echipa** - pe dbmate si flow-ul de migrare

---

## Referinte Tehnice

| Componenta             | Locatie                                                  |
| ---------------------- | -------------------------------------------------------- |
| Adaptive Timeout       | `packages/core/src/ai-gateway/adaptive-timeout.ts`       |
| Multi-Provider Gateway | `packages/core/src/ai-gateway/multi-provider-gateway.ts` |
| AI Budget Controller   | `packages/core/src/ai-gateway/ai-budget-controller.ts`   |
| Token Estimator        | `packages/core/src/ai-gateway/token-estimator.ts`        |
| Rate Limiter           | `apps/api/src/plugins/rate-limit.ts`                     |
| DB Migrations          | `db/migrations/`                                         |
| Health Checks          | `apps/api/src/routes/health.ts`                          |
| Telemetry              | `packages/core/src/telemetry.ts`                         |
| Metrics                | `packages/core/src/observability/metrics.ts`             |

---

**Document creat**: 27 Noiembrie 2025
**Versiune**: 2.0 (Post-Mitigari)

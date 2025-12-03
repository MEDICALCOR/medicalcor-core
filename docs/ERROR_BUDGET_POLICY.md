# Error Budget Policy

## MedicalCor Core Platform

**Versiune:** 1.0
**Data:** Decembrie 2024
**Owner:** Platform Team

---

## 1. Ce este Error Budget?

**Error Budget** = cantitatea de "eroare" pe care sistemul o poate tolera inainte de a incalca SLO-urile stabilite.

**Formula:**
```
Error Budget = 100% - SLO Target

Exemplu pentru SLO 99.9%:
Error Budget = 100% - 99.9% = 0.1% = 43.2 minute/luna de downtime permis
```

**Principiu:** Error budget-ul echilibreaza **inovatia** (features noi) cu **stabilitatea** (reliability). Cand budget-ul este consumat, prioritatea se muta spre stabilitate.

---

## 2. SLO-uri si Error Budget-uri MedicalCor

### 2.1 API Gateway

| SLO | Target | Error Budget (lunar) |
|-----|--------|---------------------|
| Availability | 99.9% | 43.2 minute downtime |
| Latency P95 | < 200ms | 0.1% requests > 200ms |
| Latency P99 | < 1s | 0.1% requests > 1s |
| Error Rate 5xx | < 0.5% | 0.5% failed requests |

### 2.2 Lead Scoring

| SLO | Target | Error Budget (lunar) |
|-----|--------|---------------------|
| Success Rate | 99.5% | 0.5% scoring failures |
| Latency P95 | < 5s | 0.5% requests > 5s |

### 2.3 AI Gateway

| SLO | Target | Error Budget (lunar) |
|-----|--------|---------------------|
| Availability | 99.0% | 7.2 ore downtime |
| Fallback Rate | < 20% | 20% pe fallback provider |
| Daily Spend | < $500 | $0 over budget |

### 2.4 Database

| SLO | Target | Error Budget (lunar) |
|-----|--------|---------------------|
| Availability | 99.95% | 21.6 minute downtime |
| Query P95 | < 100ms | 0.05% queries > 100ms |

### 2.5 Trigger.dev Workers

| SLO | Target | Error Budget (lunar) |
|-----|--------|---------------------|
| Job Success | 99.5% | 0.5% job failures |
| Queue Lag | < 60s | 0.5% timp > 60s lag |

---

## 3. Calculul Error Budget

### 3.1 Formula de Burn Rate

```
Current Burn Rate = (actual_errors / total_requests) / (error_budget / time_window)
```

**Interpretare:**
- Burn Rate = 1.0: Consumam exact cat e permis
- Burn Rate > 1.0: Consumam prea repede (problema!)
- Burn Rate < 1.0: Sub limita (OK pentru features)

### 3.2 Exemplu Practic

```
SLO: 99.9% availability
Error Budget lunar: 0.1% = 43.2 minute

Daca in prima saptamana avem 20 minute downtime:
- Budget consumat: 20/43.2 = 46.3%
- Burn rate: 46.3% / 25% (o saptamana din luna) = 1.85x
- Status: ROSU - consumam prea repede!
```

---

## 4. Praguri de Actiune

### 4.1 Zone de Consum

| Consum Budget | Zona | Culoare | Actiuni |
|---------------|------|---------|---------|
| 0-50% | Safe | Verde | Feature development normal |
| 50-75% | Caution | Galben | Review tehnic inainte de release |
| 75-90% | Warning | Portocaliu | Feature freeze partial |
| 90-100% | Critical | Rosu | Feature freeze complet |
| >100% | Exhausted | Negru | Incident mode |

### 4.2 Actiuni per Zona

#### Zona Verde (0-50% consumat)
- Development normal
- Features pot fi released
- Experimentare permisa
- Tech debt se adreseaza organic

#### Zona Galben (50-75% consumat)
- Review tehnic obligatoriu pentru orice release
- Rollout gradual (canary) obligatoriu
- Monitoring intens post-deploy
- Focus pe stabilitate in code reviews

#### Zona Portocaliu (75-90% consumat)
- **Feature freeze partial**
  - Doar bug fixes si security patches
  - Features critice necesita aprobare VP Engineering
- Daily standup cu focus pe reliability
- Investigatie activa a root causes
- Capacity planning urgent

#### Zona Rosu (90-100% consumat)
- **Feature freeze complet**
- Doar hotfixes critice permise
- All-hands pe reliability
- War room pentru issues majore
- Postmortem pentru orice incident

#### Zona Negru (>100% - Budget epuizat)
- **Incident mode activat**
- Postmortem obligatoriu in 48h
- No releases pentru 2 saptamani
- Actiuni remediale cu deadline strict
- Review cu leadership

---

## 5. Responsabilitati

### 5.1 Ownership

| Rol | Responsabilitate |
|-----|------------------|
| **SRE/Platform** | Monitorizare error budget, alerte, raportare |
| **Tech Lead** | Decizii release bazate pe budget status |
| **Engineering Manager** | Enforcement policy, escalation |
| **Product Manager** | Prioritizare features vs reliability |
| **VP Engineering** | Exceptii policy, strategic decisions |

### 5.2 Decision Matrix

| Decizie | Zona Verde | Zona Galben | Zona Portocaliu | Zona Rosu |
|---------|------------|-------------|-----------------|-----------|
| Release feature nou | Tech Lead | Tech Lead + Review | VP Approval | NU |
| Release bug fix | Auto | Auto | Tech Lead | Tech Lead |
| Release security patch | Auto | Auto | Auto | Auto |
| Experimentare prod | Da | Cu review | NU | NU |
| Refactoring major | Da | Cu review | NU | NU |

---

## 6. Raportare si Review

### 6.1 Raportare Automata

**Dashboard Grafana:** Error Budget Burn-down
- Actualizare: Real-time
- Metrici: Budget remaining, burn rate, trend
- Alerte: La 50%, 75%, 90%, 100%

### 6.2 Review-uri Programate

| Frecventa | Participanti | Focus |
|-----------|--------------|-------|
| Zilnic | On-call + Tech Lead | Status check, incidents |
| Saptamanal | Engineering Team | Trend analysis, planning |
| Lunar | Leadership | Strategic review, SLO adjustment |
| Trimestrial | All stakeholders | Policy review, improvements |

### 6.3 Structura Report Saptamanal

```markdown
## Error Budget Report - Saptamana X

### Status General
- API: 67% budget remaining (Zona Galben)
- AI Gateway: 85% budget remaining (Zona Verde)
- Database: 92% budget remaining (Zona Verde)

### Incidente
- [INC-123] API degradation - 15 min downtime
  - Root cause: Database connection pool exhausted
  - Remediation: Pool size increased

### Actiuni
- [ ] Implement connection pooling monitoring
- [ ] Review auto-scaling thresholds

### Recomandari
- Feature freeze NU recomandat
- Review tehnic pentru urmatorul release
```

---

## 7. Exceptii si Escalation

### 7.1 Proces de Exceptie

Pentru a release-a in zona Portocaliu/Rosu:

1. **Cerere scrisa** cu:
   - Business justification
   - Risk assessment
   - Rollback plan
   - Monitoring plan

2. **Aprobare:**
   - Zona Portocaliu: VP Engineering
   - Zona Rosu: CTO

3. **Conditii:**
   - Canary deploy obligatoriu
   - Rollback automat la degradare
   - On-call aware si standby

### 7.2 Escalation Path

```
Incident Detectat
       |
       v
On-Call Engineer (5 min)
       |
       v
Tech Lead (15 min)
       |
       v
Engineering Manager (30 min)
       |
       v
VP Engineering (1h)
       |
       v
CTO (2h)
```

---

## 8. Recalibrare SLO-uri

### 8.1 Cand se recalibreaza?

- **Quarterly review** programat
- Dupa schimbari majore de arhitectura
- Dupa incidente majore (budget epuizat)
- La feedback de la stakeholders

### 8.2 Proces de Recalibrare

1. **Colectare date**: 3 luni de metrici
2. **Analiza**: Percentile reale vs targets
3. **Propunere**: SLO nou cu justificare
4. **Review**: Cu Product + Engineering
5. **Aprobare**: VP Engineering
6. **Implementare**: Update alerts + dashboards

### 8.3 Reguli de Recalibrare

- SLO nu creste cu mai mult de 0.5% odata (ex: 99.5% -> 99.9%)
- SLO nu scade fara incident postmortem care justifica
- Minimum 1 luna intre recalibrari

---

## 9. Integrare cu Alerting

### 9.1 Alerte Error Budget

| Alert | Conditie | Severitate | Actiune |
|-------|----------|------------|---------|
| `ErrorBudgetWarning` | Budget < 50% | Warning | Notify Slack |
| `ErrorBudgetCritical` | Budget < 25% | Critical | Page on-call |
| `ErrorBudgetExhausted` | Budget < 10% | Emergency | Page Tech Lead |
| `ErrorBudgetBurnRate` | Burn rate > 2x | Warning | Notify Slack |

### 9.2 Prometheus Alert Rules

```yaml
# error-budget-alerts.yml
groups:
  - name: error_budget
    rules:
      - alert: ErrorBudgetWarning
        expr: |
          (1 - (sum(rate(http_requests_total{status=~"5.."}[30d]))
          / sum(rate(http_requests_total[30d]))))
          < 0.0005  # 50% of 0.1% budget
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Error budget below 50%"

      - alert: ErrorBudgetBurnRateHigh
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[1h]))
          / sum(rate(http_requests_total[1h]))
          > 0.002  # 2x normal burn
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Error budget burn rate 2x normal"
```

---

## 10. Checklist Lunar

- [ ] Review error budget status pentru toate serviciile
- [ ] Analiza trend burn rate
- [ ] Update stakeholders pe status
- [ ] Review exceptii acordate
- [ ] Ajustare praguri daca necesar
- [ ] Archive postmortems luna anterioara

---

## Referinte

- **SLI Definition:** `docs/SLI_DEFINITION.md`
- **Monitoring Guide:** `docs/README/MONITORING.md`
- **Incident Procedures:** `docs/DR-PROCEDURES.md`
- **Grafana Dashboards:** `infra/grafana/dashboards/`

---

*Policy pentru MedicalCor Core Platform - Decembrie 2024*

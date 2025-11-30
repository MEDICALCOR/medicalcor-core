# LISTA EXHAUSTIVĂ - CE NU A FOST IMPLEMENTAT

**Data Analizei:** 2025-11-30
**Proiect:** MedicalCor Core
**Status:** AUDIT COMPLET

---

## REZUMAT EXECUTIV

| Categorie                         | Probleme Găsite | Prioritate |
| --------------------------------- | --------------- | ---------- |
| Pagini cu Date Mock Hardcodate    | 20+             | 🔴 CRITIC  |
| Erori TypeScript                  | 55+             | 🔴 CRITIC  |
| Server Actions Lipsă              | 9+              | 🔴 CRITIC  |
| TODO/FIXME în Cod                 | 3               | 🟡 MEDIU   |
| Funcții Placeholder               | 1               | 🟡 MEDIU   |
| Metode Depreciate Neînlocuite     | 5               | 🟡 MEDIU   |
| Probleme Infrastructură Terraform | 3               | 🟡 MEDIU   |
| Dependențe Peer Nerezolvate       | 5               | 🟢 MINOR   |

---

## 1. 🔴 PAGINI CU DATE MOCK HARDCODATE (CRITIC)

Aceste pagini folosesc date fictive în loc de date reale din API/database:

### 1.1 Setări & Configurări

| Fișier                                                     | Linie  | Problemă                                                                      |
| ---------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `apps/web/src/app/api-keys/page.tsx`                       | 52-97  | `const apiKeys[]` - 4 chei API fictive                                        |
| `apps/web/src/app/settings/whatsapp/page.tsx`              | 52-113 | `const templates[]` - 5 template-uri WhatsApp mock                            |
| `apps/web/src/app/settings/integrations/page.tsx`          | 41-85  | `const initialIntegrations[]` - 5 integrări fictive                           |
| `apps/web/src/app/settings/integrations/sms/page.tsx`      | 33-76  | `const providers[]`, `const recentMessages[]`                                 |
| `apps/web/src/app/settings/integrations/calendar/page.tsx` | 40-95  | `const calendarProviders[]`, `const syncedCalendars[]`, `const recentSyncs[]` |
| `apps/web/src/app/settings/integrations/payments/page.tsx` | 42-88  | `const providers[]`, `const recentTransactions[]`                             |
| `apps/web/src/app/settings/integrations/email/page.tsx`    | 39-75  | `const providers[]`, `const recentEmails[]`                                   |
| `apps/web/src/app/settings/notifications/page.tsx`         | 27-68  | Setări notificări hardcodate                                                  |
| `apps/web/src/app/settings/templates/page.tsx`             | 55-106 | `const initialTemplates[]` - 5 template-uri mesaje                            |
| `apps/web/src/app/settings/backup/page.tsx`                | 41-74  | `const backups[]` - 4 backup-uri fictive                                      |
| `apps/web/src/app/settings/page.tsx`                       | 20-28  | useState pentru profil - fără server action                                   |

### 1.2 Management & Operațiuni

| Fișier                                   | Linie  | Problemă                                       |
| ---------------------------------------- | ------ | ---------------------------------------------- |
| `apps/web/src/app/users/page.tsx`        | 81-134 | `const initialUsers[]` - 5 utilizatori fictivi |
| `apps/web/src/app/audit/page.tsx`        | 45-134 | `const auditLogs[]` - 8 log-uri audit fictive  |
| `apps/web/src/app/waiting-list/page.tsx` | 63-132 | `const waitingList[]` - 5 pacienți mock        |
| `apps/web/src/app/clinics/page.tsx`      | 53-110 | `const clinics[]` - 4 clinici fictive          |
| `apps/web/src/app/inventory/page.tsx`    | 50-135 | `const inventory[]` - 7 produse inventar mock  |
| `apps/web/src/app/reminders/page.tsx`    | 52-111 | `const reminders[]` - 5 reminder-uri fictive   |

### 1.3 Pacienți & Medical

| Fișier                                      | Linie     | Problemă                                                                              |
| ------------------------------------------- | --------- | ------------------------------------------------------------------------------------- |
| `apps/web/src/app/billing/page.tsx`         | 52-103    | `const invoices[]` - 5 facturi mock                                                   |
| `apps/web/src/app/portal/page.tsx`          | 54-167    | `patientData`, `appointments[]`, `documents[]`, `invoices[]` - date pacient extensive |
| `apps/web/src/app/medical-records/page.tsx` | 65-204    | `records[]`, `diagnoses[]`, `prescriptions[]` - istoric medical mock                  |
| `apps/web/src/app/import/page.tsx`          | 64-118    | `mockFileColumns[]`, `mockPreviewData[]` - import CSV simulat                         |
| `apps/web/src/app/booking/page.tsx`         | 48-92, 97 | `services[]`, `doctors[]`, sloturi generate random                                    |

### 1.4 Fișiere Mock Data Exportate

| Fișier                                    | Linii  | Funcții Mock                                                                          |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `apps/web/src/lib/ai/mock-data.ts`        | 52-192 | `generateMockSuggestions()`, `generateMockSummary()`, `generateMockRecommendations()` |
| `apps/web/src/lib/analytics/mock-data.ts` | 36-149 | `generateMockMetrics()`, `generateMockLeadsOverTime()`, `generateMockAnalyticsData()` |
| `apps/web/src/lib/patients/mock-data.ts`  | 24-237 | `generateMockPatientDetail()` (marcat DEPRECATED)                                     |
| `apps/web/src/lib/workflows/mock-data.ts` | 1-285  | Template-uri workflow mock                                                            |

---

## 2. 🔴 ERORI TYPESCRIPT (CRITIC)

### 2.1 Module Lipsă - Erori TS2307

| Fișier                                                      | Import Lipsă               |
| ----------------------------------------------------------- | -------------------------- |
| `apps/web/src/app/actions/analytics/index.ts:21`            | `@medicalcor/types`        |
| `apps/web/src/app/actions/calendar/index.ts:13`             | `@medicalcor/types`        |
| `apps/web/src/app/actions/get-patients.ts:68`               | `@medicalcor/types`        |
| `apps/web/src/app/actions/messages/index.ts:21`             | `@medicalcor/types`        |
| `apps/web/src/app/actions/patients/index.ts:25`             | `@medicalcor/types`        |
| `apps/web/src/app/actions/shared/clients.ts:21`             | `@medicalcor/integrations` |
| `apps/web/src/app/actions/shared/clients.ts:22`             | `@medicalcor/domain`       |
| `apps/web/src/app/actions/shared/pagination.ts:12`          | `@medicalcor/integrations` |
| `apps/web/src/app/actions/triage/index.ts:13`               | `@medicalcor/types`        |
| `apps/web/src/app/actions/workflows.ts:4`                   | `@medicalcor/core`         |
| `apps/web/src/app/api/gdpr/delete-request/route.ts:18`      | `@medicalcor/core`         |
| `apps/web/src/app/api/gdpr/export/route.ts:16`              | `@medicalcor/core`         |
| `apps/web/src/app/osax-dashboard/actions/getOsaxCases.ts:9` | `@medicalcor/domain`       |
| `apps/web/src/app/page.tsx:15`                              | `@medicalcor/types`        |
| `apps/web/src/components/calendar/booking-modal.tsx:23`     | `@medicalcor/types`        |
| `apps/web/src/lib/auth/database-adapter.ts:9,20,227`        | `@medicalcor/core`         |
| `apps/web/src/lib/auth/server-action-auth.ts:91`            | `@medicalcor/integrations` |

### 2.2 Tipuri Implicite 'any' - Erori TS7006/TS7053

| Fișier                                                   | Linie                   | Parametru           |
| -------------------------------------------------------- | ----------------------- | ------------------- |
| `apps/web/src/app/actions/calendar/index.ts`             | 164                     | `slot`              |
| `apps/web/src/app/actions/triage/index.ts`               | 227,231,240,246,253,275 | `a`, `apt`, `c`     |
| `apps/web/src/app/analytics/page.tsx`                    | 89,234,269,298,307      | `op`, `s`, `p`, `n` |
| `apps/web/src/app/api/gdpr/export/route.ts`              | 112                     | `r`                 |
| `apps/web/src/app/messages/page.tsx`                     | 132                     | `prev`              |
| `apps/web/src/app/patient/[id]/page.tsx`                 | 194                     | `proc`              |
| `apps/web/src/app/triage/page.tsx`                       | 78,106,120              | `proc`, `lead`      |
| `apps/web/src/components/messages/conversation-list.tsx` | 162,181,190,221         | Multiple            |
| `apps/web/src/components/messages/conversation-view.tsx` | 140,152,164,223         | Multiple            |

### 2.3 Erori de Tipizare - TS2345

| Fișier                                     | Linie           | Problemă                                        |
| ------------------------------------------ | --------------- | ----------------------------------------------- |
| `apps/web/src/app/actions/triage/index.ts` | 253,258,264,270 | `unknown` nu poate fi asignat la tipul expected |

---

## 3. 🔴 SERVER ACTIONS LIPSĂ (CRITIC)

Aceste pagini au butoane/dialoguri care nu persistă datele:

| Fișier                                         | Buton/Acțiune         | Linie   | Problemă                                    |
| ---------------------------------------------- | --------------------- | ------- | ------------------------------------------- |
| `apps/web/src/app/api-keys/page.tsx`           | "Creează cheie"       | 203     | Închide dialogul fără a crea cheia          |
| `apps/web/src/app/waiting-list/page.tsx`       | "Adaugă"              | 274     | Închide dialogul fără a adăuga              |
| `apps/web/src/app/clinics/page.tsx`            | "Adaugă clinică"      | 171     | Închide dialogul fără a salva               |
| `apps/web/src/app/settings/whatsapp/page.tsx`  | "Salvează template"   | 212-213 | Fără server action                          |
| `apps/web/src/app/settings/templates/page.tsx` | "Salvează"            | 320-323 | Fără persistare                             |
| `apps/web/src/app/settings/backup/page.tsx`    | "Începe backup"       | 195-198 | Doar UI, fără backup real                   |
| `apps/web/src/app/users/page.tsx`              | "Adaugă utilizator"   | 392     | Fără server action                          |
| `apps/web/src/app/reminders/page.tsx`          | "Creează reminder"    | 250-256 | Închide fără a salva                        |
| `apps/web/src/app/booking/page.tsx`            | Confirmare programare | 610     | Folosește `alert()` în loc de server action |

---

## 4. 🟡 TODO/FIXME ÎN COD (MEDIU)

| Fișier                                       | Linie | Comentariu                                           |
| -------------------------------------------- | ----- | ---------------------------------------------------- |
| `apps/web/src/app/workflows/page.tsx`        | 97-98 | `// TODO: Implement workflow editor`                 |
| `apps/trigger/src/workflows/osax-journey.ts` | 113   | `// TODO: Check if case has been reviewed`           |
| `apps/api/src/routes/ai.ts`                  | 145   | `// TODO: Integrate with monitoring/alerting system` |

---

## 5. 🟡 FUNCȚII PLACEHOLDER (MEDIU)

### 5.1 AI Gateway - Placeholder Handlers

| Fișier                      | Linie | Problemă                                                                               |
| --------------------------- | ----- | -------------------------------------------------------------------------------------- |
| `apps/api/src/routes/ai.ts` | 67-88 | Toate funcțiile medical returnează placeholder: `{ status: 'executed', result: null }` |

### 5.2 Patient Timeline - Stub

| Fișier                                       | Linie   | Problemă                                                                        |
| -------------------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `apps/web/src/app/actions/patients/index.ts` | 424-436 | `getPatientTimelineAction()` returnează `[]` - necesită HubSpot Engagements API |

### 5.3 Workflow Editor - Empty Handler

| Fișier                                | Linie | Problemă                |
| ------------------------------------- | ----- | ----------------------- |
| `apps/web/src/app/workflows/page.tsx` | 96-99 | `handleEdit()` este gol |

---

## 6. 🟡 METODE DEPRECIATE NEÎNLOCUITE (MEDIU)

| Fișier                                         | Linie | Metodă                     | Înlocuire                    |
| ---------------------------------------------- | ----- | -------------------------- | ---------------------------- |
| `packages/integrations/src/crm/factory.ts`     | 108   | `CRMFactory` namespace     | `getCRMProvider()` direct    |
| `packages/types/src/schemas/lead.ts`           | 26    | `LeadChannelSchema`        | `LeadSourceSchema`           |
| `packages/domain/src/triage/triage-service.ts` | 367   | `assessSync()`             | `assess()` async             |
| `packages/integrations/src/whatsapp.ts`        | 842   | `canSendTemplateSync()`    | `canSendTemplate()` async    |
| `packages/integrations/src/whatsapp.ts`        | 905   | `recordTemplateSendSync()` | `recordTemplateSend()` async |
| `packages/core/src/phone.ts`                   | 427   | Old normalization          | `normalizeRomanianPhone()`   |

---

## 7. 🟡 PROBLEME INFRASTRUCTURĂ (MEDIU)

### 7.1 Terraform Placeholder Secrets

| Fișier                    | Linie | Problemă                                                     |
| ------------------------- | ----- | ------------------------------------------------------------ |
| `infra/terraform/main.tf` | 392   | `secret_data = "INITIAL_PLACEHOLDER_UPDATE_VIA_GCP_CONSOLE"` |
| `infra/terraform/main.tf` | 421   | `secret_data = "INITIAL_PLACEHOLDER_UPDATE_VIA_GCP_CONSOLE"` |
| `infra/terraform/main.tf` | 450   | `secret_data = "INITIAL_PLACEHOLDER_UPDATE_VIA_GCP_CONSOLE"` |

### 7.2 ESLint Config Broken

| Fișier             | Problemă                                              |
| ------------------ | ----------------------------------------------------- |
| `eslint.config.js` | Lipsește pachetul `@eslint/js` - ESLint nu poate rula |

---

## 8. 🟢 DEPENDENȚE PEER NEREZOLVATE (MINOR)

| App        | Pachet                                      | Cerință                                      | Instalat  |
| ---------- | ------------------------------------------- | -------------------------------------------- | --------- |
| `apps/api` | `@opentelemetry/auto-instrumentations-node` | `@opentelemetry/core@^2.0.0`                 | `1.30.1`  |
| `apps/web` | `@sentry/opentelemetry`                     | `@opentelemetry/context-async-hooks@^1.30.1` | `2.2.0`   |
| `apps/web` | `@sentry/opentelemetry`                     | `@opentelemetry/core@^1.30.1`                | `2.2.0`   |
| `apps/web` | `@sentry/opentelemetry`                     | `@opentelemetry/instrumentation@^0.57.1`     | `0.208.0` |
| `apps/web` | `@sentry/opentelemetry`                     | `@opentelemetry/sdk-trace-base@^1.30.1`      | `2.2.0`   |

---

## 9. COMPONENTE CU MOCK DATA IMPORTS

Aceste componente importă și folosesc date mock:

| Fișier                                                                | Importuri Mock                |
| --------------------------------------------------------------------- | ----------------------------- |
| `apps/web/src/components/quick-search/command-palette.tsx:26`         | `mockPatients`                |
| `apps/web/src/components/ai-copilot/patient-summary.tsx:16`           | `generateMockSummary`         |
| `apps/web/src/components/ai-copilot/smart-suggestions.tsx:8`          | `generateMockSuggestions`     |
| `apps/web/src/components/ai-copilot/procedure-recommendations.tsx:16` | `generateMockRecommendations` |

---

## 10. ALERT() ÎN PRODUCȚIE

| Fișier                              | Linie | Problemă                                                                   |
| ----------------------------------- | ----- | -------------------------------------------------------------------------- |
| `apps/web/src/app/booking/page.tsx` | 610   | `alert('Programare confirmată!')` - trebuie înlocuit cu toast/notification |

---

## PLAN DE ACȚIUNE RECOMANDAT

### Prioritate 1 - CRITICE (Trebuie rezolvate înainte de producție)

1. **Rezolvă erorile TypeScript** - Link-ează corect pachetele monorepo
2. **Înlocuiește toate datele mock** din paginile listate în secțiunea 1
3. **Implementează server actions** pentru toate butoanele de salvare
4. **Înlocuiește `alert()`** cu sistem de notificări proper

### Prioritate 2 - IMPORTANTE

5. **Implementează TODO-urile** din codul sursă
6. **Completează AI Gateway handlers** - conectează la servicii reale
7. **Implementează Patient Timeline** - integrare HubSpot Engagements API
8. **Actualizează secretele Terraform** înainte de deployment

### Prioritate 3 - ÎMBUNĂTĂȚIRI

9. **Elimină metodele depreciate** sau adaugă warning-uri
10. **Rezolvă dependențele peer** pentru OpenTelemetry
11. **Repară configurația ESLint**
12. **Elimină fișierele mock-data** din producție

---

## STATISTICI FINALE

- **Total Pagini Analizate:** 42
- **Pagini cu Mock Data:** 20 (48%)
- **Erori TypeScript:** 55+
- **Server Actions Lipsă:** 9+
- **Fișiere Mock Data:** 4
- **Placeholder Secrets:** 3
- **TODO Comments:** 3
- **Metode Depreciate:** 6

---

_Generat automat prin analiză exhaustivă a codebase-ului._

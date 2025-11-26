# Script Demo Video - MedicalCor Core

**Durată:** 3-4 minute
**Format:** Prezentare tehnică pentru dezvoltatori
**Ton:** Direct, profesional, convingător

---

## SECȚIUNEA 1: Intro (0:00 - 0:20)

**[ECRAN: Logo MedicalCor Core]**

> „Salut, sunt [NUME], developer pe proiectul **MedicalCor Core**.
>
> MedicalCor este o platformă CRM pentru clinici medicale care folosește AI pentru a califica automat pacienții, centralizează comunicarea multi-canal și gestionează conformitatea GDPR — într-o arhitectură modernă, extensibilă.
>
> Hai să vă arăt ce am construit."

---

## SECȚIUNEA 2: Funcționalități (0:20 - 1:40)

### 2.1 Calificare Automată cu AI (0:20 - 0:45)

**[ECRAN: Flux animat — mesaj intră → analiză AI → scor afișat]**

> „Funcționalitatea centrală: **lead scoring automat**.
>
> Un mesaj intră pe WhatsApp. Sistemul îl trimite la GPT-4o, care analizează intenția și returnează un scor: HOT, WARM sau COLD.
>
> Dacă pacientul menționează durere sau urgență, scorul crește automat. Avem și un fallback pe reguli, pentru cazurile în care API-ul OpenAI nu răspunde."

### 2.2 Inbox Unificat (0:45 - 1:05)

**[ECRAN: Dashboard inbox — conversații demo]**

> „Toată comunicarea — WhatsApp, apeluri, email — ajunge într-un singur loc.
>
> Recepția vede conversațiile în timp real și poate răspunde direct. Nu mai există tab-uri separate, nu mai există mesaje pierdute."

### 2.3 Workflow-uri Automate (1:05 - 1:25)

**[ECRAN: Diagramă simplificată — scor → acțiune]**

> „Pe baza scorului, sistemul acționează singur:
>
> - Scor HOT: se creează task prioritar în CRM, notificare imediată
> - Scor WARM: se declanșează o secvență de nurturing
> - Programări: reminder automat la 24h și 2h înainte
>
> Fiecare mesaj trimis este condiționat de consimțământul GDPR al pacientului."

### 2.4 Audit și Conformitate (1:25 - 1:40)

**[ECRAN: Pagină audit log — date anonimizate]**

> „Avem event sourcing complet. Fiecare acțiune este logată, consimțământul se verifică automat, iar datele personale sunt redactate din log-uri. Gata de audit oricând."

---

## SECȚIUNEA 3: Arhitectură (1:40 - 2:20)

**[ECRAN: Diagramă arhitectură — 3 layere]**

> „Arhitectura este împărțită în trei componente principale."

### Backend (1:45 - 2:00)

**[ECRAN: Stack backend]**

> „**API Gateway** cu Fastify și TypeScript strict. Validare cu Zod pe toate inputurile.
>
> **Workflow engine** cu Trigger.dev — durabil, cu retry automat, ideal pentru operații critice.
>
> **Storage**: PostgreSQL pentru date, Redis pentru cache și rate limiting."

### Frontend (2:00 - 2:10)

**[ECRAN: Stack frontend]**

> „Dashboard-ul rulează pe **Next.js 15** cu **React 19**. Componente din Radix UI, stilizare cu Tailwind. Autentificare prin NextAuth."

### Integrări (2:10 - 2:20)

**[ECRAN: Logo-uri — HubSpot, Twilio, Stripe, OpenAI]**

> „Integrări funcționale: **HubSpot** pentru CRM, **Twilio** pentru voce, **Stripe** pentru plăți, **OpenAI** pentru AI. Toate cu webhook-uri semnate și verificate."

---

## SECȚIUNEA 4: Status Proiect (2:20 - 3:00)

**[ECRAN: Checklist status]**

> „Suntem în versiunea 0.1, dezvoltare activă."

### Funcțional acum (2:25 - 2:40)

> „Ce merge:
>
> - Lead scoring AI cu fallback
> - Integrare completă WhatsApp
> - Workflow-uri durabile, testate
> - Dashboard funcțional
> - Health checks pentru deploy Kubernetes
> - Documentație tehnică actualizată"

### În plan (2:40 - 3:00)

**[ECRAN: Roadmap vizual]**

> „Ce urmează:
>
> - Dashboard analytics extins
> - Integrare calendar pentru booking online
> - Modul telemedicină
> - Teste de load și optimizări de performanță"

---

## SECȚIUNEA 5: Cum Poți Contribui (3:00 - 3:25)

**[ECRAN: Call to action]**

> „Proiectul este deschis pentru colaborare.
>
> Căutăm developeri cu experiență în **TypeScript**, **Node.js**, **React** sau **sisteme distribuite**. Dacă te pasionează healthcare tech, cu atât mai bine.
>
> Documentația e completă, codul e curat, onboarding-ul e rapid.
>
> **Scrie-mi dacă vrei să contribui.** Link în descriere.
>
> Mulțumesc."

**[ECRAN: Logo + date contact]**

---

# MODULE EXTINSE

> **Notă:** Secțiunile următoare pot fi folosite individual (videouri separate) sau adăugate la scriptul principal pentru o versiune extinsă (~12-15 minute total).

---

## MODUL A: Demo Live — Walkthrough Interfață (3:00)

**[ECRAN: Browser cu dashboard-ul deschis]**

> „Hai să parcurgem interfața pas cu pas."

### A.1 Autentificare și Dashboard Principal (0:00 - 0:30)

**[ECRAN: Pagina de login → redirect la dashboard]**

> „Login-ul folosește NextAuth cu suport pentru multiple provideri. După autentificare, ajungi pe dashboard-ul principal.
>
> Aici vezi: lead-uri noi, conversații active, programări de azi, și metrici de performanță. Totul actualizat în timp real."

### A.2 Inbox și Conversații (0:30 - 1:15)

**[ECRAN: Navigare la Messages → selectare conversație]**

> „În secțiunea Messages ai inbox-ul unificat.
>
> Lista din stânga arată toate conversațiile, sortate după ultima activitate. Poți filtra după canal: WhatsApp, Voice, Email.
>
> Când selectezi o conversație, vezi istoricul complet. În dreapta — detalii despre pacient: scor AI, consimțământ GDPR, note anterioare.
>
> Răspunsul se trimite direct din platformă. Pentru WhatsApp, mesajul pleacă prin 360dialog API."

### A.3 Managementul Pacienților (1:15 - 1:45)

**[ECRAN: Navigare la Patients → detalii pacient]**

> „Secțiunea Patients e directorul complet.
>
> Fiecare pacient are fișă: date de contact, istoric conversații, programări, documente atașate. Totul într-un singur loc.
>
> Poți adăuga note, schimba statusul, sau declanșa manual un workflow."

### A.4 Programări și Calendar (1:45 - 2:15)

**[ECRAN: Navigare la Booking → calendar view]**

> „În Booking vezi calendarul cu toate programările.
>
> View săptămânal sau zilnic. Poți crea programări noi, reprograma, sau anula. Sistemul trimite automat remindere — dacă pacientul a dat consimțământ.
>
> Staff Schedule arată disponibilitatea fiecărui medic."

### A.5 Settings și Configurare (2:15 - 3:00)

**[ECRAN: Navigare la Settings → tabs diferite]**

> „În Settings configurezi totul:
>
> - **Integrations**: conexiuni HubSpot, Twilio, Stripe — fiecare cu status și test button
> - **WhatsApp**: template-uri de mesaje, numere configurate
> - **Notifications**: ce alerte primești și pe ce canal
> - **API Keys**: generare și revocare chei pentru integrări externe
>
> Modificările se salvează instant, fără restart."

---

## MODUL B: Securitate și Protecția Datelor (2:30)

**[ECRAN: Diagramă securitate]**

> „Securitatea e construită în fiecare layer."

### B.1 Autentificare și Autorizare (0:00 - 0:35)

**[ECRAN: Flux autentificare]**

> „Autentificarea trece prin NextAuth cu suport OAuth.
>
> Avem role-based access control: admin, doctor, receptionist. Fiecare rol vede doar ce îi e permis. Un receptionist nu poate accesa rapoarte financiare. Un doctor nu poate modifica setări de sistem.
>
> Sesiunile expiră automat, tokens sunt rotite periodic."

### B.2 Protecția Webhook-urilor (0:35 - 1:10)

**[ECRAN: Cod — verificare semnătură]**

> „Fiecare webhook extern e verificat criptografic.
>
> WhatsApp: HMAC-SHA256 în header-ul `X-Hub-Signature-256`. Twilio: semnătură proprie în `X-Twilio-Signature`. Stripe și Vapi: la fel, fiecare cu schema lor.
>
> Dacă semnătura nu se potrivește, request-ul e respins instant. Zero procesare pentru request-uri nesemnate."

### B.3 Rate Limiting și Protecție DDoS (1:10 - 1:40)

**[ECRAN: Configurare rate limits]**

> „Rate limiting-ul e backed de Redis.
>
> Limite diferite pe endpoint: WhatsApp 200 req/min, Voice 100 req/min, AI execution 50 req/min. Global: 1000 req/min per IP.
>
> Depășești limita? Primești 429 cu header `Retry-After`. Circuit breaker-ul se deschide automat dacă un serviciu extern e down."

### B.4 Protecția Datelor Personale (1:40 - 2:10)

**[ECRAN: Log-uri cu date redactate]**

> „PII-ul nu ajunge în log-uri.
>
> Telefoane, email-uri, nume — toate sunt redactate automat. În loc de `+40722123456` vezi `+40***456`. Pino logger-ul face asta by default.
>
> În baza de date, datele sensibile pot fi criptate at rest. Backup-urile sunt encrypted."

### B.5 Validare și Sanitizare (2:10 - 2:30)

**[ECRAN: Schema Zod]**

> „Fiecare input trece prin Zod.
>
> Schema definită, validare strictă, erori clare. Nimic nu intră în sistem fără să fie validat. Asta previne injection attacks și date malformate.
>
> Timeout pe toate call-urile externe: 30 secunde max."

---

## MODUL C: Onboarding Dezvoltatori (2:30)

**[ECRAN: Terminal + editor]**

> „Cum pornești local în 5 minute."

### C.1 Cerințe și Clone (0:00 - 0:30)

**[ECRAN: Terminal — comenzi]**

> „Ai nevoie de: Node 20+, pnpm, Docker.
>
> ```bash
> git clone [repository]
> cd medicalcor-core
> pnpm install
> ```
>
> Monorepo-ul folosește Turborepo. `pnpm install` la root instalează totul."

### C.2 Configurare Environment (0:30 - 1:15)

**[ECRAN: Fișier .env.example]**

> „Copiază `.env.example` în `.env` pentru fiecare app: api, trigger, web.
>
> Variabile esențiale:
> - `DATABASE_URL` — PostgreSQL connection string
> - `REDIS_URL` — pentru cache și rate limiting
> - `OPENAI_API_KEY` — pentru lead scoring AI
>
> Pentru development, poți folosi serviciile locale din Docker. Pentru integrări externe (WhatsApp, HubSpot), ai nevoie de credențiale proprii sau mock-uri."

### C.3 Pornire Servicii (1:15 - 1:50)

**[ECRAN: Terminal — docker compose + pnpm dev]**

> „Pornești infrastructura:
>
> ```bash
> docker compose up -d
> ```
>
> Asta ridică PostgreSQL și Redis local.
>
> Apoi aplicațiile:
>
> ```bash
> pnpm dev
> ```
>
> Turborepo pornește toate app-urile în paralel: API pe 3000, Web pe 3001, Trigger în background."

### C.4 Verificare și Teste (1:50 - 2:15)

**[ECRAN: Browser + terminal teste]**

> „Verifici că merge:
>
> - `http://localhost:3000/health` — API health check
> - `http://localhost:3001` — Dashboard web
>
> Rulezi testele:
>
> ```bash
> pnpm test
> pnpm lint
> ```
>
> CI-ul rulează aceleași comenzi. Dacă trec local, trec și în pipeline."

### C.5 Structura Proiectului (2:15 - 2:30)

**[ECRAN: Tree structure în editor]**

> „Structura e clară:
>
> - `apps/api` — Fastify webhook gateway
> - `apps/trigger` — Trigger.dev workflows
> - `apps/web` — Next.js dashboard
> - `packages/core` — utilități comune
> - `packages/domain` — business logic
> - `packages/integrations` — clienți externi
>
> Documentația tehnică e în `docs/`. Start de acolo."

---

## MODUL D: Cazuri de Utilizare (2:00)

**[ECRAN: Ilustrații scenarii]**

> „Câteva scenarii concrete din practică."

### D.1 Pacient Nou pe WhatsApp (0:00 - 0:40)

**[ECRAN: Animație flux complet]**

> „Scenariu: cineva scrie pe WhatsApp 'Bună, am o urgență dentară, mă doare măseaua'.
>
> Ce se întâmplă:
> 1. Mesajul intră prin webhook, semnătura se verifică
> 2. AI-ul detectează: urgență, durere, procedură probabilă = extracție
> 3. Scor: HOT (5/5)
> 4. Se creează task prioritar în HubSpot cu deadline 30 minute
> 5. Pacientul primește confirmare automată
> 6. Recepția vede notificarea instant
>
> Timp total: sub 3 secunde."

### D.2 Secvență de Nurturing (0:40 - 1:15)

**[ECRAN: Timeline mesaje]**

> „Scenariu: lead WARM interesat de implanturi, dar fără urgență.
>
> Sistemul declanșează nurture sequence:
> - Ziua 1: mesaj cu beneficiile implanturilor
> - Ziua 3: detalii despre procedură
> - Ziua 7: testimoniale pacienți
> - Ziua 14: call-to-action pentru programare
>
> Fiecare mesaj verifică consimțământul înainte de trimitere. Dacă pacientul răspunde între timp, secvența se oprește și conversația devine live."

### D.3 Reminder Programare (1:15 - 1:35)

**[ECRAN: Notificare reminder]**

> „Scenariu: pacient programat mâine la 10:00.
>
> - Cu 24h înainte: reminder cu data, ora, adresa
> - Cu 2h înainte: reminder final
>
> Cron job-ul rulează la fiecare oră, verifică programările, trimite doar dacă există consimțământ activ."

### D.4 Apel Vocal cu Transcriere (1:35 - 2:00)

**[ECRAN: Flux apel → transcriere]**

> „Scenariu: pacient sună la clinică.
>
> - Twilio rutează apelul
> - Vapi AI poate prelua inițial (opțional)
> - După apel: transcriere automată
> - Se extrag keywords: proceduri menționate, urgență, date
> - Rezumatul apare în fișa pacientului
>
> Recepția are context complet fără să fi ascultat apelul."

---

## MODUL E: FAQ Tehnic (2:00)

**[ECRAN: Format Q&A]**

> „Răspunsuri la întrebările frecvente."

### E.1 De ce Fastify și nu Express? (0:00 - 0:25)

> „Fastify e de ~2x mai rapid pe benchmarks. Are schema validation built-in, plugin system curat, și TypeScript support excelent. Pentru un API care procesează webhook-uri în volum mare, performanța contează."

### E.2 De ce Trigger.dev pentru workflows? (0:25 - 0:50)

> „Trigger.dev oferă durabilitate. Dacă un job eșuează, se reîncearcă automat. Dacă serverul cade, job-ul continuă de unde a rămas. Pentru operații critice — trimitere mesaje, actualizare CRM — nu vrem să pierdem nimic. E serverless, scalează singur."

### E.3 Cum scalează arhitectura? (0:50 - 1:15)

> „API-ul e stateless — poți pune oricâte instanțe în spatele unui load balancer. Redis e shared pentru rate limiting. PostgreSQL suportă read replicas. Trigger.dev scalează automat în cloud. Kubernetes-ready din prima zi."

### E.4 Ce se întâmplă dacă OpenAI e down? (1:15 - 1:35)

> „Fallback pe rule-based scoring. Keywords predefinite: 'durere', 'urgență', 'preț' — fiecare cu scor asociat. Nu e la fel de smart, dar sistemul continuă să funcționeze. Lead-urile nu se pierd."

### E.5 Cum gestionați GDPR? (1:35 - 2:00)

> „Consimțământul e stocat per tip: marketing, remindere, procesare date. Fiecare mesaj outbound verifică consimțământul relevant. Event sourcing înseamnă audit trail complet — cine, ce, când. Datele pot fi șterse la cerere. Log-urile nu conțin PII."

---

## MODUL F: Comparație și Diferențiatori (1:30)

**[ECRAN: Tabel comparativ]**

> „Ce face MedicalCor diferit?"

### F.1 vs. CRM-uri Generice (HubSpot, Salesforce) (0:00 - 0:30)

> „CRM-urile generice nu înțeleg contextul medical. Nu știu ce e un implant, nu detectează urgența dintr-un mesaj. Trebuie customizare masivă.
>
> MedicalCor e construit pentru healthcare: proceduri dentare predefinite, scoring adaptat, conformitate GDPR/HIPAA din start."

### F.2 vs. Soluții Medicale Existente (0:30 - 1:00)

> „Majoritatea soluțiilor medicale sunt monolitice, closed-source, greu de integrat.
>
> MedicalCor e modular: nu vrei AI scoring? Dezactivezi. Ai deja CRM? Integrezi doar inbox-ul. API-first design, documentație completă, webhook-uri standard."

### F.3 Avantaje Cheie (1:00 - 1:30)

**[ECRAN: Lista bullet points]**

> „Pe scurt, diferențiatorii:
>
> - **AI nativ**: scoring în timp real, nu batch processing
> - **Multi-canal real**: WhatsApp, voce, email în același inbox
> - **Durabilitate**: Trigger.dev garantează că nimic nu se pierde
> - **Open architecture**: extensibil, integrabil, documentat
> - **Compliance by design**: GDPR nu e un add-on, e în fundație
>
> Nu reinventăm CRM-ul. Îl facem să funcționeze pentru clinici medicale."

---

## GHID PRODUCȚIE VIDEO

### Materiale necesare — Script Principal (3:25)

| Material | Note |
|----------|------|
| Dashboard demo | Date fictive, mod sandbox |
| Inbox conversații | Mesaje mock, fără PII |
| Flux lead scoring | Animație sau screen recording |
| Diagramă arhitectură | Simplificată, 3 layere |

### Materiale necesare — Module Extinse

| Modul | Materiale |
|-------|-----------|
| A: Demo Live | Screen recording navigare completă dashboard |
| B: Securitate | Diagrame flux auth, snippet cod verificare semnătură |
| C: Onboarding | Terminal recording: clone → install → run |
| D: Cazuri utilizare | Animații flux pentru fiecare scenariu |
| E: FAQ Tehnic | Slides sau text overlay pentru Q&A |
| F: Comparație | Tabel comparativ, liste diferențiatori |

### De evitat:
- Date reale de pacienți sau clinici
- API keys, secrets, tokens vizibile
- URL-uri interne sau adrese IP
- Cod sursă cu credențiale
- Repository URLs reale în onboarding (folosește placeholder)

### Recomandări:
- Blur automat pe orice arată ca date reale
- Text overlay pentru termeni cheie
- Muzică ambient discretă (fără voce)
- Pauze scurte între secțiuni pentru editare
- Fiecare modul poate fi video separat sau capitol în playlist

---

## DURATE ESTIMATE

| Conținut | Durată |
|----------|--------|
| **Script Principal** | 3:25 |
| Modul A: Demo Live | 3:00 |
| Modul B: Securitate | 2:30 |
| Modul C: Onboarding | 2:30 |
| Modul D: Cazuri Utilizare | 2:00 |
| Modul E: FAQ Tehnic | 2:00 |
| Modul F: Comparație | 1:30 |
| **Total Extins** | ~17:00 |

---

## VERSIUNI RECOMANDATE

### Versiune Scurtă (2 minute)
| Timp | Conținut |
|------|----------|
| 0:00-0:15 | Intro: ce face aplicația |
| 0:15-0:50 | Features: lead scoring + inbox + GDPR |
| 0:50-1:20 | Tech: backend/frontend/integrări |
| 1:20-2:00 | Status + CTA |

### Versiune Standard (3-4 minute)
Script principal complet — ideal pentru prima expunere.

### Versiune Extinsă (~17 minute)
Script principal + toate modulele — ideal pentru playlist sau documentație video completă.

### Module Individuale
Fiecare modul poate fi publicat separat:
- **Pentru developeri noi**: Modul C (Onboarding)
- **Pentru decidenți tehnici**: Modul B (Securitate) + Modul F (Comparație)
- **Pentru demo clienți**: Modul A (Demo Live) + Modul D (Cazuri Utilizare)

---

*Versiune: 3.0*
*Actualizat: Noiembrie 2024*

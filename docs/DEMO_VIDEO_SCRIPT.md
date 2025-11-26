# Script Demo Video - MedicalCor Core

**Durată:** 3-4 minute
**Format:** Prezentare pentru dezvoltatori și stakeholderi tehnici
**Ton:** Orientat spre beneficii, profesional, convingător

---

## SECȚIUNEA 1: Problema și Soluția (0:00 - 0:25)

**[ECRAN: Logo MedicalCor Core]**

> „Salut, sunt [NUME], developer pe proiectul **MedicalCor Core**.
>
> Clinicile medicale pierd pacienți pentru că nu răspund suficient de rapid, nu prioritizează corect urgențele, și jonglează între prea multe canale de comunicare.
>
> **MedicalCor rezolvă asta**: califică automat pacienții cu AI, centralizează toate conversațiile, și automatizează follow-up-ul — fără să pierzi conformitatea GDPR.
>
> Rezultatul? Timp de răspuns redus, mai puține lead-uri pierdute, echipă mai eficientă."

---

## SECȚIUNEA 2: Beneficii Cheie (0:25 - 1:40)

### 2.1 Prioritizare Instantanee cu AI (0:25 - 0:50)

**[ECRAN: Flux animat — mesaj intră → analiză AI → scor afișat]**

> „**Problema**: recepția petrece timp prețios citind fiecare mesaj pentru a decide cine e urgent.
>
> **Soluția**: AI-ul analizează mesajele în sub 3 secunde și clasifică automat: HOT, WARM sau COLD.
>
> Un pacient care scrie 'mă doare măseaua, e urgent' primește scor HOT instant. Recepția primește notificare prioritară. Pacientul primește confirmare automată.
>
> **Beneficiu**: zero lead-uri urgente ratate, timp de răspuns sub 5 minute pentru cazuri critice."

### 2.2 Un Singur Inbox, Zero Mesaje Pierdute (0:50 - 1:10)

**[ECRAN: Dashboard inbox — conversații demo]**

> „**Problema**: echipa verifică WhatsApp, email, apeluri — în aplicații separate. Mesaje se pierd.
>
> **Soluția**: tot ce intră — WhatsApp, apeluri, email — ajunge într-un singur loc, în timp real.
>
> **Beneficiu**: productivitate crescută, vizibilitate completă, niciun pacient uitat."

### 2.3 Follow-up Automat, Conversie Mai Mare (1:10 - 1:25)

**[ECRAN: Diagramă simplificată — scor → acțiune]**

> „**Problema**: lead-urile WARM sunt ignorate pentru că echipa se concentrează pe urgențe.
>
> **Soluția**: sistemul trimite automat secvențe de nurturing personalizate:
> - Lead HOT → task prioritar în CRM, deadline 30 minute
> - Lead WARM → secvență automată pe 14 zile
> - Programări → remindere la 24h și 2h
>
> **Beneficiu**: conversie mai mare fără efort manual suplimentar."

### 2.4 Conformitate Fără Efort (1:25 - 1:40)

**[ECRAN: Pagină audit log — date anonimizate]**

> „**Problema**: GDPR înseamnă risc legal și audit-uri stresante.
>
> **Soluția**: consimțământul se verifică automat înainte de fiecare mesaj. Audit trail complet. Datele personale redactate din log-uri.
>
> **Beneficiu**: gata de audit oricând, zero risc de amenzi."

---

## SECȚIUNEA 3: Fundație Tehnică Solidă (1:40 - 2:20)

**[ECRAN: Diagramă arhitectură — 3 layere]**

> „Pentru developeri: arhitectura e construită pentru scalabilitate și fiabilitate."

### Backend (1:45 - 2:00)

**[ECRAN: Stack backend]**

> „**Fastify + TypeScript** — performanță de 2x față de Express, type safety complet.
>
> **Trigger.dev** pentru workflow-uri — durabil, cu retry automat. Dacă cade serverul, job-ul continuă de unde a rămas. Zero mesaje pierdute.
>
> **PostgreSQL + Redis** — scalabil, battle-tested."

### Frontend (2:00 - 2:10)

**[ECRAN: Stack frontend]**

> „**Next.js 15 + React 19** — cel mai recent stack, performanță optimă.
>
> Dashboard responsive, componente Radix UI, autentificare securizată."

### Integrări (2:10 - 2:20)

**[ECRAN: Logo-uri — HubSpot, Twilio, Stripe, OpenAI]**

> „Integrări production-ready: **HubSpot**, **Twilio**, **Stripe**, **OpenAI**.
>
> Toate cu webhook-uri semnate criptografic — zero vulnerabilități la spoofing."

---

## SECȚIUNEA 4: Status și Oportunitate (2:20 - 3:00)

**[ECRAN: Checklist status]**

> „Suntem în versiunea 0.1 — momentul ideal să te alături."

### Ce e Gata (2:25 - 2:40)

> „Funcțional acum:
>
> - Lead scoring AI cu fallback automat
> - Integrare completă WhatsApp
> - Workflow-uri durabile, testate
> - Dashboard funcțional
> - Deployment-ready pentru Kubernetes
> - Documentație tehnică completă"

### Oportunități de Contribuție (2:40 - 3:00)

**[ECRAN: Roadmap vizual]**

> „Ce construim next:
>
> - Analytics dashboard — metrici de conversie, performanță echipă
> - Booking online — integrare calendar
> - Telemedicină — consultații video integrate
>
> Fiecare feature e o oportunitate să ai impact real într-un produs healthcare."

---

## SECȚIUNEA 5: De Ce Să Te Alături (3:00 - 3:30)

**[ECRAN: Call to action]**

> „**De ce MedicalCor?**
>
> - **Impact real**: ajuți clinici să trateze pacienți mai eficient
> - **Stack modern**: TypeScript, Next.js 15, Trigger.dev — tehnologii de viitor
> - **Cod curat**: arhitectură modulară, documentație completă, onboarding rapid
> - **Comunitate**: colaborare deschisă, feedback direct, contribuții vizibile
>
> Căutăm developeri cu experiență în **TypeScript**, **Node.js**, **React** sau **sisteme distribuite**.
>
> **Scrie-mi dacă vrei să contribui.** Link în descriere.
>
> Mulțumesc."

**[ECRAN: Logo + date contact]**

---

# MODULE EXTINSE

> **Notă:** Secțiunile următoare pot fi folosite individual (videouri separate) sau adăugate la scriptul principal pentru o versiune extinsă (~12-15 minute total).

---

## MODUL A: Demo Live — Experiența Utilizatorului (3:00)

**[ECRAN: Browser cu dashboard-ul deschis]**

> „Să vedem cum arată o zi de lucru cu MedicalCor."

### A.1 Start Rapid: Dashboard-ul Principal (0:00 - 0:30)

**[ECRAN: Pagina de login → redirect la dashboard]**

> „Dimineața, recepția deschide dashboard-ul și vede instant:
>
> - Câte lead-uri noi au intrat peste noapte
> - Conversații care așteaptă răspuns
> - Programările de azi
> - Metrici de performanță
>
> **Beneficiu**: în 5 secunde știi exact ce ai de făcut. Zero timp pierdut verificând multiple aplicații."

### A.2 Inbox Unificat: Răspuns Rapid (0:30 - 1:15)

**[ECRAN: Navigare la Messages → selectare conversație]**

> „Un pacient a scris pe WhatsApp aseară. În inbox vezi:
>
> - Mesajul, cu scorul AI deja calculat (HOT)
> - Istoricul complet al conversației
> - Detalii pacient: consimțământ GDPR, note, programări anterioare
>
> Răspunzi direct din platformă — fără să deschizi altă aplicație.
>
> **Beneficiu**: timp de răspuns redus dramatic, context complet la un click."

### A.3 Fișa Pacientului: Tot Ce Trebuie Să Știi (1:15 - 1:45)

**[ECRAN: Navigare la Patients → detalii pacient]**

> „Click pe pacient și vezi totul:
>
> - Date contact, istoric conversații, documente
> - Programări trecute și viitoare
> - Status lead și notițe echipă
>
> Poți declanșa manual un workflow sau schimba statusul cu un click.
>
> **Beneficiu**: zero căutări în multiple sisteme, informație centralizată."

### A.4 Programări: Vizibilitate și Control (1:45 - 2:15)

**[ECRAN: Navigare la Booking → calendar view]**

> „Calendarul arată toate programările — pe zi sau săptămână.
>
> Creezi programări noi, reprogramezi, anulezi. Staff Schedule arată disponibilitatea fiecărui medic.
>
> Sistemul trimite automat remindere (24h și 2h înainte) — doar dacă pacientul a dat consimțământ.
>
> **Beneficiu**: mai puține neprezentări, calendar mereu actualizat."

### A.5 Configurare: Flexibilitate Totală (2:15 - 3:00)

**[ECRAN: Navigare la Settings → tabs diferite]**

> „În Settings controlezi totul:
>
> - **Integrări**: HubSpot, Twilio, Stripe — cu status și test button
> - **Template-uri WhatsApp**: personalizate pentru clinica ta
> - **Notificări**: ce alerte primești și pe ce canal
> - **API Keys**: pentru integrări externe
>
> Modificările se salvează instant. Nu e nevoie de developer pentru configurări de bază.
>
> **Beneficiu**: adaptezi platforma la fluxul tău, nu invers."

---

## MODUL B: Securitate — Protecție și Încredere (2:30)

**[ECRAN: Diagramă securitate]**

> „Într-un mediu medical, securitatea nu e opțională — e fundația încrederii."

### B.1 Control Acces: Cine Vede Ce (0:00 - 0:35)

**[ECRAN: Flux autentificare]**

> „**Problema**: într-o clinică, nu toată lumea trebuie să vadă totul.
>
> **Soluția**: role-based access control — admin, doctor, receptionist. Fiecare vede doar ce îi e permis.
>
> Un receptionist nu poate accesa rapoarte financiare. Un doctor nu poate modifica setările de sistem.
>
> **Beneficiu**: separare clară a responsabilităților, risc redus de breșe interne."

### B.2 Protecție Împotriva Atacurilor (0:35 - 1:10)

**[ECRAN: Cod — verificare semnătură]**

> „**Problema**: sistemele expuse la internet sunt ținte pentru atacatori.
>
> **Soluția**: fiecare webhook extern e verificat criptografic (HMAC-SHA256). Dacă semnătura nu se potrivește, request-ul e respins instant.
>
> **Beneficiu**: zero procesare pentru request-uri false, imunitate la spoofing."

### B.3 Stabilitate Sub Presiune (1:10 - 1:40)

**[ECRAN: Configurare rate limits]**

> „**Problema**: un val de request-uri poate pune sistemul în genunchi.
>
> **Soluția**: rate limiting per endpoint și per IP. Circuit breaker automat dacă un serviciu extern e down.
>
> **Beneficiu**: sistemul rămâne stabil chiar și sub atacuri DDoS sau spike-uri de trafic."

### B.4 Protecția Datelor Pacienților (1:40 - 2:10)

**[ECRAN: Log-uri cu date redactate]**

> „**Problema**: GDPR cere protecție strictă a datelor personale.
>
> **Soluția**: telefoane, email-uri, nume — toate sunt redactate automat din log-uri. În loc de `+40722123456` vezi `+40***456`.
>
> Backup-uri criptate, date sensibile encrypted at rest.
>
> **Beneficiu**: conformitate GDPR by default, zero expunere accidentală de PII."

### B.5 Validare Strictă: Nimic Nu Trece Neverificat (2:10 - 2:30)

**[ECRAN: Schema Zod]**

> „**Problema**: input-uri malițioase pot compromite sistemul.
>
> **Soluția**: fiecare input trece prin Zod — schema definită, validare strictă. Nimic nu intră în sistem fără verificare.
>
> **Beneficiu**: prevenire SQL injection, XSS, și alte atacuri. Zero surprize."

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

## MODUL D: Scenarii Reale — Valoare în Practică (2:00)

**[ECRAN: Ilustrații scenarii]**

> „Să vedem cum MedicalCor transformă situații reale în rezultate concrete."

### D.1 Urgența Care Nu Se Pierde (0:00 - 0:40)

**[ECRAN: Animație flux complet]**

> „**Situația**: Duminică seara, un pacient scrie pe WhatsApp 'Am o urgență, mă doare măseaua'.
>
> **Fără MedicalCor**: mesajul e văzut luni dimineață, pacientul a sunat altă clinică.
>
> **Cu MedicalCor**:
> - AI-ul detectează urgența în 3 secunde → Scor HOT
> - Task prioritar în CRM, deadline 30 minute
> - Pacientul primește confirmare automată: 'Am primit mesajul, te contactăm în curând'
> - Recepția primește notificare pe telefon
>
> **Rezultat**: pacientul se simte văzut, clinica nu pierde un caz urgent."

### D.2 Lead-ul Cald Care Devine Pacient (0:40 - 1:15)

**[ECRAN: Timeline mesaje]**

> „**Situația**: cineva întreabă despre implanturi, dar nu e pregătit să programeze.
>
> **Fără MedicalCor**: lead-ul e uitat, niciodată contactat din nou.
>
> **Cu MedicalCor**: nurture sequence automată pe 14 zile:
> - Ziua 1: beneficiile implanturilor
> - Ziua 3: detalii procedură, prețuri orientative
> - Ziua 7: testimoniale pacienți mulțumiți
> - Ziua 14: call-to-action pentru programare
>
> Dacă răspunde între timp, secvența se oprește, conversația devine live.
>
> **Rezultat**: lead-uri WARM convertite fără efort manual."

### D.3 Zero Neprezentări (1:15 - 1:35)

**[ECRAN: Notificare reminder]**

> „**Situația**: pacienți care uită de programare și nu se prezintă.
>
> **Cu MedicalCor**:
> - 24h înainte: reminder cu data, ora, adresa
> - 2h înainte: reminder final
> - Totul automat, doar pentru pacienți cu consimțământ
>
> **Rezultat**: mai puține neprezentări, calendar optimizat, venit protejat."

### D.4 Apelul Cu Context Complet (1:35 - 2:00)

**[ECRAN: Flux apel → transcriere]**

> „**Situația**: pacient sună, recepția nu știe cine e și ce vrea.
>
> **Cu MedicalCor**:
> - Apelul e transcris automat
> - Keywords extrase: proceduri menționate, urgență, date
> - Rezumat în fișa pacientului
>
> **Rezultat**: recepția are context complet înainte de callback. Conversație mai eficientă, pacient impresionat."

---

## MODUL E: Întrebări Frecvente — Decizii Tehnice (2:00)

**[ECRAN: Format Q&A]**

> „Răspunsuri la întrebările pe care le primim cel mai des."

### E.1 De ce e sistemul rapid? (0:00 - 0:25)

> „**Întrebare**: cât de repede procesează un mesaj?
>
> **Răspuns**: sub 3 secunde de la primire la scor. Fastify e de 2x mai rapid decât Express, TypeScript previne erori la runtime.
>
> **De ce contează**: un pacient urgent primește confirmare instant, nu după 5 minute."

### E.2 Ce se întâmplă dacă cade serverul? (0:25 - 0:50)

> „**Întrebare**: se pierd mesaje dacă e o problemă tehnică?
>
> **Răspuns**: nu. Trigger.dev oferă durabilitate — dacă un job eșuează, se reîncearcă automat. Dacă serverul cade, job-ul continuă de unde a rămas.
>
> **De ce contează**: zero mesaje pierdute, zero lead-uri ratate."

### E.3 Poate gestiona volume mari? (0:50 - 1:15)

> „**Întrebare**: ce se întâmplă dacă clinica crește?
>
> **Răspuns**: arhitectura e stateless — adaugi instanțe după nevoie. Redis, PostgreSQL, Trigger.dev — toate scalează orizontal. Kubernetes-ready din prima zi.
>
> **De ce contează**: platforma crește odată cu clinica, fără migrări dureroase."

### E.4 Dacă OpenAI nu funcționează? (1:15 - 1:35)

> „**Întrebare**: depindem complet de OpenAI?
>
> **Răspuns**: nu. Avem fallback pe reguli — keywords predefinite cu scoruri asociate. Nu e la fel de smart, dar sistemul continuă să funcționeze.
>
> **De ce contează**: uptime garantat chiar și când serviciile externe au probleme."

### E.5 Cum stăm cu GDPR? (1:35 - 2:00)

> „**Întrebare**: suntem conformi GDPR?
>
> **Răspuns**: da. Consimțământ verificat înainte de fiecare mesaj, audit trail complet, date personale redactate din log-uri, drept la ștergere implementat.
>
> **De ce contează**: zero risc legal, audit-uri fără stres."

---

## MODUL F: De Ce MedicalCor — Avantaj Competitiv (1:30)

**[ECRAN: Tabel comparativ]**

> „Să vedem de ce MedicalCor e alegerea potrivită."

### F.1 vs. CRM-uri Generice (HubSpot, Salesforce) (0:00 - 0:30)

> „**Problema cu CRM-urile generice**: trebuie luni de customizare. Nu știu ce e un implant, nu detectează urgența, nu înțeleg GDPR medical.
>
> **Avantajul MedicalCor**: construit pentru healthcare din prima zi:
> - Proceduri dentare predefinite
> - Scoring adaptat pentru context medical
> - Conformitate GDPR/HIPAA inclusă
>
> **Rezultat**: funcțional în zile, nu luni."

### F.2 vs. Soluții Medicale Tradiționale (0:30 - 1:00)

> „**Problema cu soluțiile existente**: monolitice, closed-source, greu de integrat cu ce ai deja.
>
> **Avantajul MedicalCor**: modular și flexibil:
> - Nu vrei AI? Dezactivezi
> - Ai deja CRM? Integrezi doar inbox-ul
> - API-first, webhook-uri standard, documentație completă
>
> **Rezultat**: se integrează în ecosistemul tău, nu îl înlocuiește."

### F.3 Avantajele Cheie (1:00 - 1:30)

**[ECRAN: Lista bullet points]**

> „**De ce să alegi MedicalCor:**
>
> - **Rapiditate**: AI scoring în 3 secunde, nu batch processing
> - **Centralizare**: WhatsApp, voce, email — un singur inbox
> - **Fiabilitate**: zero mesaje pierdute, garantat de Trigger.dev
> - **Flexibilitate**: extensibil, integrabil, open architecture
> - **Conformitate**: GDPR nu e add-on, e fundație
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

*Versiune: 4.0*
*Actualizat: Noiembrie 2024*
*Ton: Orientat spre beneficii și valoare de business*

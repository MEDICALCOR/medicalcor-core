# Script Demo Video - MedicalCor Core

**Durată estimată:** 3-4 minute
**Ton:** Profesional, clar, concis
**Audiență:** Dezvoltatori interesați de colaborare

---

## SECȚIUNEA 1: Intro (0:00 - 0:25)

**[ECRAN: Logo MedicalCor + tagline]**

> **NARATOR:**
>
> „Bună! Mă numesc [NUME] și astăzi vreau să vă prezint **MedicalCor Core** — o platformă CRM medicală cu inteligență artificială, construită pentru clinici dentare și cabinete medicale.
>
> **Pe scurt:** aplicația automatizează calificarea pacienților, gestionează comunicarea pe mai multe canale și asigură conformitatea GDPR — totul dintr-o singură interfață."

---

## SECȚIUNEA 2: Funcționalități Actuale (0:25 - 1:45)

**[ECRAN: Dashboard principal - date demo/mock]**

> **NARATOR:**
>
> „Să vedem ce funcționează acum în aplicație:"

### 2.1 Lead Scoring cu AI (0:30 - 0:55)

**[ECRAN: Animație flux de date - mesaj WhatsApp → AI → clasificare]**

> „Prima funcționalitate majoră este **calificarea automată a lead-urilor**.
>
> Când un potențial pacient trimite un mesaj pe WhatsApp, sistemul analizează conversația folosind GPT-4o și clasifică automat lead-ul ca HOT, WARM sau COLD.
>
> Dacă cineva menționează urgență sau durere, sistemul detectează acest lucru și prioritizează cazul."

### 2.2 Comunicare Multi-Canal (0:55 - 1:15)

**[ECRAN: Inbox unificat - conversații mock]**

> „Aplicația centralizează comunicarea din **WhatsApp, apeluri vocale și email** într-un inbox unificat.
>
> Echipa de recepție vede toate conversațiile într-un singur loc și poate răspunde direct din platformă."

### 2.3 Automatizări și Workflow-uri (1:15 - 1:35)

**[ECRAN: Diagrama workflow - lead scoring → nurture sequence]**

> „Pe baza scorului, sistemul declanșează automat acțiuni:
>
> - Lead-urile **HOT** creează task-uri prioritare în CRM
> - Lead-urile **WARM** primesc o secvență de nurturing personalizată
> - Reminderele pentru programări se trimit automat la 24h și 2h înainte
>
> Toate cu verificare de consimțământ GDPR înainte de fiecare mesaj."

### 2.4 Conformitate GDPR (1:35 - 1:45)

**[ECRAN: Pagina de audit log - date anonimizate]**

> „Fiecare acțiune este logată, consimțământul pacienților este verificat automat, iar datele personale sunt redactate din log-uri."

---

## SECȚIUNEA 3: Stack Tehnologic (1:45 - 2:25)

**[ECRAN: Diagramă arhitectură simplificată]**

> **NARATOR:**
>
> „Câteva cuvinte despre tehnologiile folosite:"

### Backend (1:50 - 2:05)

**[ECRAN: Lista tehnologii backend]**

> „**Backend-ul** este construit cu:
>
> - **Fastify** și **TypeScript** pentru API-ul principal
> - **Trigger.dev** pentru workflow-uri durabile cu retry automat
> - **PostgreSQL** pentru date, cu **Redis** pentru rate limiting
> - **Zod** pentru validarea strictă a tuturor inputurilor"

### Frontend (2:05 - 2:15)

**[ECRAN: Lista tehnologii frontend]**

> „**Frontend-ul** folosește:
>
> - **Next.js 15** cu **React 19**
> - **Tailwind CSS** și **Radix UI** pentru componente
> - **NextAuth** pentru autentificare"

### Integrări (2:15 - 2:25)

**[ECRAN: Logo-uri integrări]**

> „Aplicația se integrează cu **HubSpot** pentru CRM, **Twilio** pentru apeluri vocale, **Stripe** pentru plăți, și **OpenAI** pentru analiza AI."

---

## SECȚIUNEA 4: Status și Roadmap (2:25 - 3:05)

**[ECRAN: Timeline/roadmap vizual]**

> **NARATOR:**
>
> „**Unde suntem acum?**
>
> Proiectul este în faza de dezvoltare activă, versiunea 0.1. Infrastructura de bază este funcțională, iar funcționalitățile principale au fost testate."

### Ce funcționează (2:35 - 2:50)

**[ECRAN: Checklist cu bifă]**

> „Funcționalități complete:
>
> - Lead scoring cu AI și fallback pe reguli
> - Integrare WhatsApp cu webhook-uri verificate
> - Workflow-uri durabile cu Trigger.dev
> - Dashboard administrativ de bază
> - Health checks pentru Kubernetes
> - Documentație tehnică completă"

### Ce urmează (2:50 - 3:05)

**[ECRAN: Lista next steps]**

> „**Next steps:**
>
> - Extinderea dashboard-ului cu analitics detaliate
> - Integrare calendar pentru programări online
> - Modul de telemedicină
> - Optimizări de performanță și teste de încărcare"

---

## SECȚIUNEA 5: Call to Action (3:05 - 3:30)

**[ECRAN: Contact info + GitHub]**

> **NARATOR:**
>
> „Acesta este un proiect open pentru colaborare.
>
> **Căutăm dezvoltatori** cu experiență în:
>
> - TypeScript și Node.js
> - React/Next.js
> - Integrări API și sisteme distribuite
> - Sau pur și simplu pasionați de healthcare tech
>
> **Dacă vrei să contribui, să dai feedback sau să discutăm, scrie-mi!**
>
> Găsești repository-ul și documentația tehnică în descriere.
>
> Mulțumesc pentru vizionare!"

**[ECRAN: Logo + link repository + email contact]**

---

## NOTE TEHNICE PENTRU PRODUCȚIE

### Screencasts necesare:
1. **Dashboard demo** (cu date fictive, nu reale)
2. **Inbox conversații** (mock conversations)
3. **Flux lead scoring** (animație sau screencast simulat)
4. **Pagină settings** (configurări vizibile, fără secrets)

### De evitat:
- Date reale de pacienți
- API keys sau secrets vizibile în cod
- Adrese IP sau URL-uri interne
- Informații despre clinici reale

### Recomandări vizuale:
- Folosește modul demo/sandbox pentru screencasts
- Blur pe orice date care par reale
- Background muzical subtil, non-distract
- Text overlay pentru punctele cheie

---

## VARIANTA SCURTĂ (2 minute)

Pentru o versiune mai scurtă, păstrează doar:

1. **Intro** (0:00 - 0:15): Ce face aplicația în 2 propoziții
2. **Features** (0:15 - 1:00): Lead scoring AI + Inbox unificat + GDPR
3. **Tech** (1:00 - 1:30): Backend/Frontend/Integrări (lista rapidă)
4. **CTA** (1:30 - 2:00): Status + cum poți contribui

---

*Script creat: Noiembrie 2024*
*Versiune: 1.0*

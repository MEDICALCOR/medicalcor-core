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

## GHID PRODUCȚIE VIDEO

### Materiale necesare:
| Material | Note |
|----------|------|
| Dashboard demo | Date fictive, mod sandbox |
| Inbox conversații | Mesaje mock, fără PII |
| Flux lead scoring | Animație sau screen recording |
| Diagramă arhitectură | Simplificată, 3 layere |

### De evitat:
- Date reale de pacienți sau clinici
- API keys, secrets, tokens vizibile
- URL-uri interne sau adrese IP
- Cod sursă cu credențiale

### Recomandări:
- Blur automat pe orice arată ca date reale
- Text overlay pentru termeni cheie
- Muzică ambient discretă (fără voce)
- Pauze scurte între secțiuni pentru editare

---

## VERSIUNE CONDENSATĂ (2 minute)

| Timp | Secțiune | Conținut |
|------|----------|----------|
| 0:00-0:15 | Intro | O propoziție: ce face aplicația |
| 0:15-0:50 | Features | Lead scoring + inbox + GDPR |
| 0:50-1:20 | Tech | Backend/frontend/integrări (listă) |
| 1:20-2:00 | Status + CTA | Ce merge, ce urmează, cum contribui |

---

*Versiune: 2.0*
*Actualizat: Noiembrie 2024*

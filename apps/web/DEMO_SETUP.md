# 🚀 Setup pentru Demo Live - MedicalCor Core

## ✅ Ce a fost implementat

### 1. Landing Page OSAX-FIX (`/campanii/osax-fix`)
- ✅ Hero section cu video background
- ✅ Quiz interactiv cu 4 întrebări
- ✅ CTA sticky pe mobile
- ✅ Design optimizat pentru conversie
- ✅ Rute publice configurate în `auth/config.ts`

### 2. OSAX War Room Dashboard (`/osax-dashboard`)
- ✅ View Kanban cu coloane organizate pe status
- ✅ View Table cu sortare și filtrare
- ✅ Buton "Trigger Concierge" cu gradient teal
- ✅ Statistici live (Total Cases, Pending Review, Active Treatments, Compliance Rate)
- ✅ Filtre rapide (All Cases, Urgent, Pending Review, In Treatment, Severe)

### 3. AI Feedback în SmartSuggestions
- ✅ Butoane 👍/👎 pentru fiecare sugestie AI
- ✅ Feedback vizual (culoare verde pentru pozitiv, roșu pentru negativ)
- ✅ Gata pentru integrare cu API (comentariu în cod)

## 📁 Structura Fișierelor

```
apps/web/
├── src/
│   ├── app/
│   │   ├── campanii/
│   │   │   └── osax-fix/
│   │   │       └── page.tsx          # Landing page
│   │   └── osax-dashboard/
│   │       ├── page.tsx              # Server component principal
│   │       └── components/
│   │           ├── OsaxCaseTable.tsx
│   │           ├── OsaxKanbanBoard.tsx
│   │           └── OsaxDashboardView.tsx  # Client wrapper pentru view switching
│   └── components/
│       └── ai-copilot/
│           └── smart-suggestions.tsx  # Cu butoane feedback
├── public/
│   └── videos/
│       └── hero-bg.mp4              # Video hero (trebuie adăugat)
```

## 🎬 Pași pentru Demo

### Pasul 1: Adaugă Video Hero
1. Descarcă un video scurt (5-10 secunde) de pe Pexels/Mixkit
2. Salvează-l ca `apps/web/public/videos/hero-bg.mp4`
3. Opțional: Adaugă un poster image `apps/web/public/hero-bg-poster.jpg`

### Pasul 2: Verificare Locală
```bash
cd apps/web
pnpm dev
```

Apoi verifică:
- ✅ `http://localhost:3001/campanii/osax-fix` - Landing page se încarcă?
- ✅ Quiz-ul se deschide când apeși pe buton?
- ✅ Pe mobil (Chrome DevTools), butonul CTA este sticky jos?
- ✅ `http://localhost:3001/osax-dashboard` - Vezi coloanele Kanban?
- ✅ Poți schimba între Kanban și Table view?
- ✅ Apare butonul "Trigger Concierge"?
- ✅ Deschide un pacient - apar butoanele 👍/👎 la sugestiile AI?

### Pasul 3: Variabile de Mediu (Opțional)
Pentru demo mode, adaugă în `.env.local`:
```bash
NEXT_PUBLIC_DEMO_MODE=true
```

### Pasul 4: Deploy pe Vercel
```bash
git add .
git commit -m "feat: add osax landing and war room dashboard"
git push origin main
```

Vercel va face deploy automat dacă repo-ul este conectat.

## 🐛 Debugging

### Dacă pagina e albă sau apare eroare:
1. Verifică console-ul browser-ului (F12)
2. Verifică terminalul unde rulează `pnpm dev`
3. Copiază eroarea și folosește Cursor Chat pentru fix

### Dacă video-ul nu se încarcă:
- Verifică că fișierul există în `public/videos/hero-bg.mp4`
- Verifică că extensia este `.mp4`
- Dacă nu există video, pagina va folosi gradient fallback

### Dacă Kanban nu apare:
- Verifică că există date în baza de date pentru OSAX cases
- Verifică că `getOsaxCases` returnează date valide

## 📝 Note Importante

1. **Landing Page** este publică (nu necesită autentificare)
2. **OSAX Dashboard** necesită autentificare
3. **Butoanele de feedback** AI sunt funcționale dar nu trimit încă date la API (comentariu în cod pentru integrare viitoare)
4. **Trigger Concierge** afișează toast notification (poate fi extins cu workflow real)

## 🎯 Next Steps (Opțional)

1. Adaugă drag-and-drop real pentru Kanban (folosind `@dnd-kit/core`)
2. Integrează feedback-ul AI cu API endpoint
3. Adaugă workflow real pentru Trigger Concierge
4. Adaugă analytics pentru tracking conversii pe landing page


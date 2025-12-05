# Video Assets pentru Landing Page

## Hero Background Video

Pentru landing page-ul `/campanii/osax-fix`, ai nevoie de un video hero background.

### Specificații recomandate:
- **Format**: MP4 (H.264)
- **Durată**: 5-10 secunde (loop)
- **Rezoluție**: 1920x1080 (Full HD) sau mai mare
- **Dimensiune**: < 5MB pentru performanță optimă
- **Conținut**: Video cu zâmbet de pacient sau frezare 3D dentală

### Surse gratuite:
1. **Pexels**: https://www.pexels.com/search/dental/
2. **Mixkit**: https://mixkit.co/free-stock-video/medical/
3. **Pixabay**: https://pixabay.com/videos/search/dental/

### Instalare:
1. Descarcă video-ul
2. Redenumește-l în `hero-bg.mp4`
3. Salvează-l în acest director: `apps/web/public/videos/hero-bg.mp4`

### Fallback:
Dacă video-ul nu există, pagina va folosi un gradient overlay pentru text readability.

### Optimizare (Opțional):
Pentru performanță mai bună, poți crea și o imagine poster:
- Salvează un frame din video ca `hero-bg-poster.jpg`
- Va fi folosit ca placeholder până când video-ul se încarcă


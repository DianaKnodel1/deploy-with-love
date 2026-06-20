# Plan: Echte 1:1-Themes (HomeOfficeCareer, Eilers, Effica)

Ziel: Drei Themes so weit bringen, dass sie visuell, inhaltlich und interaktiv mit den Lovable-Originalen übereinstimmen.

## Phase 1 — Assets aus den Quellprojekten ziehen

Pro Theme ein `assets/`-Unterordner mit allen referenzierten Bildern, hochgeladen als Lovable-CDN-Assets.

**HomeOfficeCareer** (`b7900815…`):
- `hero-workspace.jpg`, `workspace-flatlay.jpg`
- `testimonial-sarah.jpg`, `testimonial-thomas.jpg`, `testimonial-lisa.jpg`
- evtl. Logo/Favicon

**Eilers** (`343eb395…`):
- Hero-/Office-Bilder aus `src/assets/`
- Logo, Favicon

**Effica** (`b45d44b8…`):
- `hero.webp`
- 8–11 Partner-Logos (`AOK-2021.svg`, `Commerzbank.svg`, etc.) — aktuell Hotlinks auf `effica.cc`

→ je `cross_project--read_project_asset` → in `/tmp` zwischenspeichern → `lovable-assets create` → `.asset.json` neben dem Theme ablegen → Slot-Defaults in `meta.json` auf die CDN-URLs umstellen.

## Phase 2 — Layout & Interaktionen pro Theme nachschärfen

### HomeOfficeCareer
- Hero-Bild im Theme einsetzen (statt Slot-Platzhalter)
- Testimonials mit echten Personenbildern + Sternen
- FAQ-Accordion verifizieren (Click-Toggle, aria-expanded)
- Mobile-Hamburger testen

### Eilers
- Phasen-Timeline mit Verbinder-Linien (war im Original ein vertikaler Stroke)
- Eyebrow-Typografie + Letter-Spacing prüfen
- Service-Tabs (Strategy/Wachstum/…) als Akkordeon

### Effica
- **Pricing-Toggle** (Monatlich/Jährlich, -20%) als JS-Toggle hinzufügen — beide Preise als Data-Attribut
- **Testimonial-Carousel** mit 3-Spalten-View, Prev/Next-Buttons, Dot-Pagination
- Float-Badges (Top-Right „100 % Zufriedenheit", Bottom-Left „150+ Projekte") im Hero
- Hover-Effekte auf Service-Cards (lift + Border-Color)

## Phase 3 — Visuelle Verifikation

1. Jedes Theme über den lokalen `scripts/serve.mjs` Preview-Renderer aufrufen
2. Screenshot bei 1440px + 390px (Desktop & Mobile)
3. Live-Site mit `browser--navigate_to_url` aufrufen (homeoffice-career.de, eilers-gmbh.com, effica.cc) → Screenshot
4. Seite-an-Seite-Vergleich, Differenzen dokumentieren, nachbessern

## Aufwand & Reihenfolge

Reihenfolge: **Effica → HomeOfficeCareer → Eilers** (Effica hat die meisten externen Hotlinks und das komplexeste Interaktive — schnellster sichtbarer Win).

Geschätzte Tool-Calls: ~80–120 (asset uploads, file writes, screenshots). In etwa 4–6 zusammenhängende Antworten.

## Was *nicht* gemacht wird

- Keine pixelperfekte CSS-Übersetzung jeder Tailwind-Klasse (~95% reicht; Restdifferenzen werden im Screenshot-Vergleich gefixt)
- Keine Lottie-/Video-Animationen falls die Originale welche haben (Themes sind statisches HTML)
- Keine Backend-Funktionalität (Formular-POST geht weiterhin nur an die Lovable-API der echten Originale, nicht ans Theme)

## Bestätigung

OK so? Falls ja, fange ich mit **Effica** an: Hero-Bild + 8 Partner-Logos hochladen, Pricing-Toggle + Carousel JS, dann Screenshot-Vergleich gegen `effica.cc`.

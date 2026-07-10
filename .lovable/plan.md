# 10 neue Landing-Page-Themes

## Ziel
5 Themes für **App/Webseite-Testing-Dienstleistung** + 5 Themes für **Personalvermittlung generisch**. Jedes Theme visuell klar unterschiedlich, mit KI-generierten Hero-Bildern und einem eigens gestylten Bewerbungsformular. Alle Themes werden in die bestehende `THEMES`-Registry (`src/lib/landing-themes.ts`) eingehängt und sind sofort im Landing-Generator wählbar.

## Die 10 Themes

### Testing / QA-Dienstleistung (5)
1. **`theme-tester-lab`** — Editorial/Magazin-Stil, warme Erdtöne (Terracotta/Sand), Serif-Headlines. „Feldnotizen aus dem Homeoffice-Testlabor". Ruhig, seriös, journalistisch.
2. **`theme-qa-grid`** — Bento-Grid, Dark Mode, Neon-Mint-Akzent, Mono-Font für Zahlen. Sehr technisch, „Ops-Dashboard-Vibe" — spricht techaffine Bewerber an.
3. **`theme-remote-flow`** — Split-Screen mit großen Fotos rechts, viel Whitespace links, sanfte Pastelltöne (Blush/Sky). Human, warm, „New-Work"-Ästhetik.
4. **`theme-device-stack`** — Isometrische Geräte-Illustrationen, Purple-Gradient, Card-Grid. Playful-Corporate, Fintech-nah.
5. **`theme-quality-report`** — Ultra-minimal Swiss-Style, schwarz auf gebrochenem Weiß, sehr strenge Typo (Neue Haas Grotesk-artig), rote Akzentlinien. Awwwards-Level Ruhe.

### Personalvermittlung generisch (5)
6. **`theme-career-atlas`** — Zeitschriften-Cover-Look, große Foto-Hero, Kuratier-Serif + Sans-Body, warme Beige-Töne. „Karriere-Kompass"-Positionierung.
7. **`theme-connect-people`** — Zwei-spaltiges Portrait-Grid mit realen Homeoffice-Szenen, weiche Schatten, Sage-Grün. Community-Fokus.
8. **`theme-fast-match`** — Corporate-Blau, klare Icons, Stufen-Prozess-Grafik, sehr traditioneller Personalberater-Look (Vertrauen, Bank-Nähe).
9. **`theme-talent-hub`** — Broken-Grid, asymmetrisch, Chrome/Iridescent-Akzente auf Off-White. Modern, agentur-nah.
10. **`theme-partner-network`** — Full-Width-Sections mit alternierenden Farbbändern (Emerald + Cream), Foto-Sektionen wie ein Corporate-Report. Premium, „Enterprise-HR".

## Umfang pro Theme
Jedes Theme bekommt:
- `src/landing-themes/<id>/template.html` — vollständige Landing (Hero, About, Prozess/Steps, Salary/Benefits, Footer) mit `{{slots}}`
- `src/landing-themes/<id>/style.css` — themeneigener Namespace-Prefix (z.B. `.tl-` für `tester-lab`)
- `src/landing-themes/<id>/script.js` — kleiner Enhancer (Scroll-Reveal, Nav-Toggle)
- `src/landing-themes/<id>/meta.json` — id, name, description, `slots[]` mit Defaults
- `src/landing-themes/_shared/form-section-<id>.html` + `.css` — eigenes Form-Styling, das visuell zum Theme passt
- Registrierung in `src/lib/landing-themes.ts` (Imports + `pickFormAssets` + `THEMES`-Array)

## Bilder
- **Hero-Bild pro Theme**: 10 KI-generierte Bilder via `imagegen--generate_image`, gespeichert in `src/assets/landing-themes/<id>-hero.jpg`. Prompts sind auf den jeweiligen Theme-Stil abgestimmt (photorealistisch für 3,4,5,6,7,10; illustrativ für 2,4,9; editorial für 1,5).
- **Sekundärbilder**: 5 zusätzliche Bilder für die auffälligsten Themes (1, 5, 6, 8, 10 bekommen ein zweites Motiv im About/Prozess-Bereich). Restliche Themes nutzen Unsplash.
- Kein KI-Bild pro Slot-Default — Bilder werden fix im Template referenziert und können pro Landing im Admin überschrieben werden.

## Umsetzungsreihenfolge
1. **Assets zuerst** — alle 15 KI-Bilder generieren (parallelisierbar in 3 Batches à 5), damit später keine Templates auf fehlende Assets zeigen.
2. **Themes 1–5 (Testing)** — Template + CSS + Script + Meta + Form-Section pro Theme, Registry-Eintrag am Ende jedes Themes.
3. **Themes 6–10 (Vermittlung)** — gleicher Ablauf.
4. **Registry-Konsolidierung** — `src/lib/landing-themes.ts` bekommt alle 10 neuen Imports und 10 neue `pickFormAssets`-Zweige in einem finalen Edit.
5. **Build-Check** — `bun run build` läuft grün.

## Was NICHT enthalten ist
- Keine Änderung am Bewerbungs-Modal-Wrapper (bleibt zentral in `landing-themes.ts`).
- Keine neuen Slots-Typen — nur `text`, `longtext`, `image`, `color` (existierende Typen).
- Keine Änderung an bestehenden Themes.
- Keine Screenshots/Preview-Pages unter `public/theme-preview/` — die generiert der Landing-Generator on-demand.

## Aufwand & Credits
- ~60 neue Dateien
- 15 KI-Bilder (`imagegen fast`-Tier reicht für Hero-Fotos; `standard` für die 5 Sekundärbilder mit feinen Details)
- Reine Bauzeit: ~8–10 Turns, ich arbeite die Themes seriell ab und melde nach je 2 Themes kurz den Zwischenstand.

## Offene Freigabe
Bevor ich die Bilder generiere (das kostet Credits), bestätige bitte:
- **A)** „Los, alles wie geplant" → ich starte mit den 15 Bildern und baue durch.
- **B)** „Zuerst nur Themes 1+2 als Pilot" → ich baue erst zwei komplett fertig, du reviewst, dann Rest.
- **C)** „Andere Aufteilung / andere Stile" → sag welche Themes ändern.

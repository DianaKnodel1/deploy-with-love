# Umsetzungsplan — Stage 2 (ohne API-Keys)

## Klärungen vorab

**B) Mitarbeiter-Freischaltung — ja, gilt für beide Wege**
Sowohl Klassisch als auch Fast-Track enden gleich: Bewerber registriert sich im Mitarbeiter-Portal → Status `pending_activation` → Admin klickt "Freischalten" → Status `active`. Der Unterschied liegt nur **davor** (Zusage-Mail bei Klassisch vs. Auto-Akzeptanz bei Fast-Track). Der Freischalt-Button (Punkt B aus Stage 1) wird also für **alle** angezeigt, die `pending_activation` sind — egal welcher Flow.

**D) "Zusage senden"-Button — bestätigt**
Genau so wie du es beschreibst: Bewerbung kommt rein → Admin klickt "Annehmen / Zusage senden" → Modal mit Vorschau der Willkommens-Mail (Name, Firma, Registrierungs-Link) → "Senden" → Mail geht raus, `accepted_at` gesetzt, Status "Akzeptiert". Bewerber bekommt Mail mit Link → registriert sich → wird Mitarbeiter (siehe B).

---

## Was ich jetzt umsetze

### A) Tenant-spezifische Kohorten
- `getCohortStats` in `src/lib/landing-cohorts.functions.ts` bekommt optionalen `tenantId`-Filter
- `requireSupabaseAuth` + `has_role(admin)`-Check ergänzen
- `/admin/statistiken`: Pro Vermittlungs-Landing eigene Funnel-Card statt eine gemischte Übersicht

### C) Drei E-Mail-Templates
Neu in `/admin/email-templates`:
- `klassisch_zusage` — "Herzlich willkommen, bitte registrieren" (mit Link)
- `klassisch_absage` — höfliche Absage
- `fast_track_welcome` — "Schön dass du dabei bist, gleich geht's los"

Variablen: `{{first_name}}`, `{{last_name}}`, `{{company_name}}`, `{{registration_url}}`

### D) "Zusage senden"-Modal (Klassisch-Tab)
In `src/routes/admin.applications.index.tsx`:
- Button "Zusage senden" pro Klassisch-Bewerber
- Modal: gerendertes Template-Preview + Empfänger
- "Senden"-Klick → enqueue in `transactional_emails`, setzt `applications.accepted_at = now()`, `status = 'accepted'`
- Toast + Liste aktualisiert sich

Außerdem: "Absage senden"-Button mit gleichem Flow + `klassisch_absage`-Template.

### E) 15-Sekunden-Countdown auf Fast-Track Pop-up
In `src/routes/bewerbung.index.tsx` (bzw. wo der Erfolgs-State liegt):
- Countdown von 3s auf 15s
- Text: "Sie werden gleich ins Mitarbeiter-Portal geleitet zur Registrierung!"
- Sekunden-Anzeige sichtbar
- "Jetzt weiter"-Button zum Überspringen

### F) Einheitliche Status-Badges
Neue Komponente `src/components/ApplicationStatusBadge.tsx`:
| Status | Farbe | Label |
|---|---|---|
| `new` | grau | Neu |
| `accepted` | blau | Akzeptiert |
| `registered` | violett | Registriert |
| `active` | grün | Freigeschaltet |
| `rejected` | rot | Abgelehnt |

Verwendet in: `admin.applications.index.tsx`, `admin.applications.$appId.tsx`, `admin.employees.index.tsx`.

---

## Reihenfolge der Implementation
1. F (Badge-Komponente) — Basis für alle Listen
2. C (Templates) — werden in D verwendet
3. D (Zusage-Modal + Klassisch-Akzeptieren-Flow)
4. A (Tenant-Kohorten)
5. E (15s-Countdown)

## Was danach noch offen bleibt (braucht Keys)
- KI-Interview-Chat (`/interview/$appId`) → braucht Gemini-Key
- Voice-Interview → braucht ElevenLabs-Key
- KI-Scoring → braucht Gemini-Key

Soll ich loslegen?

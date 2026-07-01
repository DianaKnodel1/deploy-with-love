## Ziel

Klarer Ablauf abgebildet in der Sidebar + saubere Datenbasis:

```
Vermittlung → Calendly → Fasttrack Interview
    → (positiv) angenommen → E-Mail „Registriere dich"
    → Registrierung → Onboarding (Vertrag + Ausweis)
    → Admin prüft & schaltet frei → Mitarbeiter
```

## 1. Sidebar aufteilen

Aus einem Punkt „Personen" werden **zwei**:

- **👥 Bewerbungen** — alle im Funnel bis „angenommen + registriert"
  Spalten: Name · E-Mail · Phase (Termin/Interview/Angenommen/Registriert) · Quelle · Aktion
- **👤 Mitarbeiter** — nur registrierte Personen ab Onboarding
  Spalten: Name · E-Mail · Onboarding-Fortschritt · Status (Prüfung/Freigeschaltet/Abgelehnt) · Aktion „Annehmen / Ablehnen"

`admin/personen` bleibt als Redirect auf `admin/bewerbungen`, damit alte Links nicht brechen.

## 2. Status-Automatik (kein Admin-Klick nach Interview)

- Interview `recommendation = invite` → `applications.status = 'akzeptiert'` **automatisch** (macht `interview-voice` bereits).
- Trigger: **E-Mail „Herzlichen Glückwunsch, jetzt registrieren"** wird beim Wechsel auf `akzeptiert` versendet (mit Link auf `/register?token=...`).
- Nach Registrierung: Profile entsteht, `profiles.onboarding_status = 'offen'`.
- Nach Onboarding-Abschluss (Vertrag + Ausweis eingereicht): `profiles.onboarding_status = 'wartet_pruefung'`.
- **Admin klickt „Annehmen"** in Mitarbeiter-Liste → `profiles.status = 'angenommen'` → voller Portal-Zugang.
- Ablehnen: `profiles.status = 'abgelehnt'` → kein Zugang.

## 3. Cleanup alter Bewerber

Einmalige Aktion mit Vorschau:

- Zähle: Bewerbungen ohne `user_id` und älter als X Tage.
- Admin sieht Zahl + Button „Löschen" (Bestätigungsdialog).
- Mitarbeiter (mit Profile) bleiben **immer** unangetastet.
- Registrierte Bewerbungen (mit `user_id`) bleiben.

## Technisch

- Neue Route `src/routes/admin.bewerbungen.tsx` (aus jetziger `admin.personen.tsx` ausgekoppelt, nur Application-Zeilen + Filter Termin/Interview/Angenommen).
- Neue Route `src/routes/admin.mitarbeiter.tsx` (nur Profiles, mit „Annehmen/Ablehnen" wenn `onboarding_status = 'wartet_pruefung'`).
- `admin.personen.tsx` → Redirect-Stub auf `/admin/bewerbungen`.
- `AdminLayout` Sidebar: „Personen" ersetzt durch die zwei neuen Einträge.
- Server-Fn `deleteOrphanApplications({ olderThanDays })` in `src/lib/admin-delete.functions.ts` (nur admin, nur ohne `user_id`).
- E-Mail-Trigger: In `interview-voice.ts` beim Setzen von `status='akzeptiert'` → `send-invitation-email` mit Template „registrierung".

## Offene Frage

- Cleanup-Alter: **30 / 60 / 90 Tage** — welche Schwelle möchtest du als Default?

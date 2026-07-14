# Eigenes Buchungssystem — Ersatz für Calendly

## Ziel

Ein schlankes, in die Plattform integriertes Termin-System für Bewerbungsgespräche. Bewerber:
- sehen freie Slots einer Landing-Page / eines Tenants
- buchen einen Termin (ohne Login, per Magic Link)
- bekommen Bestätigungs-Mail mit ICS + Absage-/Umbuchen-Link
- können absagen und neu buchen
- werden 30 Min vor Termin per E-Mail an das Interview erinnert (bestehende Reminder-Function)

Admin:
- definiert **Verfügbarkeiten** (Wochenrhythmus + Ausnahmen) pro Recruiter/Landing-Page
- sieht alle gebuchten Termine im bestehenden `admin.bewerbungen`-View
- kann Termine manuell verschieben/absagen

## Was wir NICHT bauen (bewusst)

- Keine Kalender-Sync (Google/Outlook) — Recruiter tragen Blocker in unserer UI ein
- Keine Team-Round-Robin-Logik — 1 Landing-Page = 1 Recruiter-Kalender
- Keine Zahlungen, keine Gruppen-Events mit Anmeldeliste
- Kein öffentliches Widget-Embedding — Buchung läuft auf unserer Domain

## Datenmodell (neue Tabellen)

```text
availability_schedules       (pro Recruiter/Landing-Page: Wochenraster)
 ├─ id, tenant_id, landing_page_id, name, timezone
 ├─ slot_duration_minutes (default 30)
 ├─ buffer_before_minutes, buffer_after_minutes
 ├─ min_notice_hours (z.B. 4h Vorlaufzeit)
 └─ max_days_ahead (z.B. 21 Tage im Voraus buchbar)

availability_rules           (Wochentags-Regeln)
 ├─ schedule_id, weekday (0-6), start_time, end_time

availability_exceptions      (Urlaub / Extra-Slots)
 ├─ schedule_id, date, is_blocked, start_time, end_time

interview_appointments       (die eigentlichen Buchungen)
 ├─ id, tenant_id, application_id, schedule_id
 ├─ starts_at, ends_at, timezone
 ├─ status: scheduled | cancelled | no_show | completed
 ├─ cancel_token (uuid, für Absage-Link ohne Login)
 ├─ cancelled_at, cancelled_by (applicant|admin), cancel_reason
 ├─ rescheduled_from_id (Kette bei Neubuchung)
 └─ created_at, updated_at
```

Migration ersetzt Calendly-Felder nicht sofort — `applications.booking_status` bleibt (`scheduled/cancelled/…`) und wird vom neuen System genauso gesetzt. `calendly_url` in `landing_pages` wird optional; wenn `schedule_id` gesetzt ist, hat das Vorrang.

## Bewerber-Flow (neue Routen)

```text
/buchen/:applicationToken            → Slot-Picker (7-Tage-Grid)
/buchen/:applicationToken/bestaetigt → Bestätigungsseite mit ICS-Download
/termin/:cancelToken                 → "Termin absagen oder verschieben"
/termin/:cancelToken/neu             → Slot-Picker für Neubuchung
```

Slot-Picker berechnet freie Slots **live** aus:
- Wochenregeln + Ausnahmen
- minus bereits gebuchte `interview_appointments` (status='scheduled')
- minus `min_notice_hours` ab jetzt
- bis `max_days_ahead`
- in Bewerber-Zeitzone (aus Browser)

## Admin-Flow (erweitert bestehende Views)

- Neue Seite `admin.verfuegbarkeit`: Wochenraster-Editor + Ausnahmen-Kalender
- `admin.bewerbungen`: bestehende Termin-Spalte zeigt `interview_appointments` statt Calendly-Event
- Buchungs-Detail: Verschieben / Absagen mit Grund

## E-Mails (nutzen bestehendes SMTP + Templates)

Neue Templates pro Tenant (Fallback = Default):
- `appointment_confirmed` — nach Buchung, mit ICS
- `appointment_cancelled_by_admin` — mit Neubuchen-Link
- `appointment_rescheduled` — alte Zeit → neue Zeit

Bestehende Reminder greifen automatisch weiter:
- `interview_invite_30min` — 30 Min vorher (existiert schon)
- `rebook_after_cancel_24h/72h` — greift bei `booking_status='cancelled'` (existiert schon)

## Interview-Durchführung

Das eigentliche Interview (Chat/Voice mit KI-Recruiterin) existiert bereits (`landing_pages.interview_mode`, `applications.interview_messages` usw.). Neu:
- Interview-Link wird **erst 15 Min vor `starts_at`** aktiv (verhindert Vorab-Chats)
- 30-Min-Reminder-Mail enthält bereits Interview-Link → passt zusammen
- Nach Ende: `interview_appointments.status='completed'` wird automatisch gesetzt (Cron), wenn Interview-Status `done|timeout` ist

## Technischer Aufbau

Backend:
- Migration (neue Tabellen, RLS, Grants, Indexes)
- Server Functions in `src/lib/appointments.functions.ts`:
  - `getAvailableSlots({ applicationToken, timezone })` — public, kein Auth
  - `bookAppointment({ applicationToken, startsAt, timezone })` — public
  - `cancelAppointment({ cancelToken, reason })` — public
  - `rescheduleAppointment({ cancelToken, newStartsAt })` — public
  - `adminListAppointments`, `adminCancelAppointment`, `adminUpsertSchedule` — auth
- Slot-Berechnung als Postgres-Function `get_free_slots(schedule_id, from, to)` — performant, atomar
- Race-Condition-Schutz: Buchung per SQL `INSERT ... WHERE NOT EXISTS (overlap check)` + Unique Exclusion Constraint `EXCLUDE USING gist (schedule_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status='scheduled')`

Frontend:
- Neue Routen unter `src/routes/buchen.$token.tsx`, `src/routes/termin.$token.tsx`
- Slot-Grid-Komponente (7 Tage, klickbar, Zeitzone im Header)
- Admin: `src/routes/_authenticated/admin/verfuegbarkeit.tsx`

ICS-Generierung: eigene Mini-Utility (`src/lib/ics.ts`), kein Package nötig.

## Migration bestehender Daten

- Bestehende Landing-Pages mit `calendly_url` behalten Calendly aktiv, solange kein `schedule_id` gesetzt ist → sanfter Rollout
- Ein Tenant kann testweise auf das neue System umgestellt werden, ohne andere zu brechen
- `applications.calendly_event_uri` bleibt für Historie

## Umsetzungs-Reihenfolge (jeweils separate Deploys)

1. **DB + Slot-Engine** — Migration, Postgres-Function, Server-Functions inkl. Unit-Test der Slot-Berechnung
2. **Admin-Verfügbarkeits-Editor** — damit wir überhaupt Slots anlegen können
3. **Bewerber-Buchungsseite** — `/buchen/:token` mit Slot-Picker + Bestätigung + ICS-Mail
4. **Absagen / Neubuchen** — `/termin/:cancelToken`
5. **Umschalter auf Landing-Page** — Admin wählt: Calendly oder eigenes System
6. **Cleanup** (später) — wenn stabil, Calendly-Felder deprecaten

## Offene Fragen

1. **Slot-Länge**: Fix 30 Min für alle, oder pro Landing-Page einstellbar? (Vorschlag: pro Landing-Page, Default 30)
2. **Mehrere Recruiter pro Tenant**: Braucht Personalservice Süd 1 oder mehrere parallele Kalender? (Vorschlag: 1 Kalender pro Landing-Page — reicht für alle aktuellen Cases)
3. **Roll-out**: Erst kompletter Bau + Test intern, dann 1 Test-Tenant, dann alle? Oder direkt bei Personalservice Süd scharf schalten sobald fertig?
4. **Calendly-Bestand**: Bestehende Calendly-Buchungen (nächste 14 Tage) — mitmigrieren oder Calendly parallel weiterlaufen lassen bis leergelaufen? (Vorschlag: parallel laufen lassen)

Sag mir zu diesen 4 Punkten kurz Bescheid, dann starte ich mit Schritt 1 (DB + Slot-Engine).


## Ziel

Vier zusammenhängende Änderungen sauber umsetzen — plus zwei konkrete Fehler aus deinem Log fixen.

---

## 1. Bewerbungseingang-Mail entfernen

Aktuell versucht `src/routes/api/public/applications.ts` nach jeder Bewerbung `send-signup-confirmation` mit `templateName: "application_received"` aufzurufen. Diese Function erwartet aber `email + password + tenant_id` (Auth-Signup) und antwortet deshalb konsequent mit **400 "Missing required fields: email, password, tenant_id"** (siehe Log).

**Fix:** Den ganzen `application_received`-Aufruf in `applications.ts` löschen (Zeilen ~260–295). Die Vermittlungs-Landing versendet dann nur noch:
- „Bewerber: Kein Termin" (24h/72h)
- „Bewerber: No-Show" (24h nach Termin)
- akzeptiert / abgelehnt (Admin-Aktion)

Der Tab **„Bewerbungseingang"** in `src/routes/admin.email-templates.tsx` wird entfernt, damit das UI keine tote Vorlage mehr anzeigt.

Die tenant-Spalten `application_received_*` können bleiben (später löschbar, brechen nichts).

---

## 2. Fix: `column applications.updated_at does not exist`

Der Fehler kommt aus einer der Reminder-/Bounce-Queries. Ich lokalisiere die genaue Zeile über die Log-Label-Suche (`invite query`) und entweder
- (a) füge die Spalte per Migration hinzu, falls sie fachlich gewollt ist, oder
- (b) entferne den Verweis (order/update) aus der Query.

Wahrscheinlich (b) — `applications` hat historisch nur `created_at`.

---

## 3. No-Show-Badge + Reminder-Status in `admin.bewerbungen.tsx`

**Neue Anzeige pro Bewerbung** (Detail-View + optional als Icons in der Liste):
- Badge **„No-Show"** wenn `scheduled_at < now` UND kein `interview_started_at` UND kein `interview_completed_at`
- Reminder-Chips: **„Kein-Termin 24h ✉ 08.07."**, **„Kein-Termin 72h ✉ 10.07."**, **„No-Show ✉ 11.07."** — nur die tatsächlich versendeten, mit Datum
- Fehl-Status („✉ failed") in Rot mit Fehlermeldung im Tooltip

**Datenquelle:** `application_reminder_log` (bereits vorhanden) — eine Query pro Detail-Öffnung, in der Liste nur ein aggregierter Count (`sent_reminders: 2`) damit die Bewerbungen-Liste schnell bleibt.

**Manuelle Aktion:** Button „No-Show markieren" der `applications.status = 'no_show'` setzt (neuer Status im Enum, migration).

---

## 4. SMTP-Rate-Limit für Reputationsschutz

Aktuell fährt `send-application-reminders` alle fälligen Reminder in einem Cron-Lauf raus — bei einem Peak können das je Tenant 100+ Mails auf einmal sein → Provider drosselt / markiert als Spam.

**Umsetzung, konservativ:**
- Pro Tenant hartes Limit **max. 40 Reminder-Mails pro Cron-Lauf** (vorhandene `capReached`-Logik in `send-reminders` als Vorbild).
- Pro Tenant **max. 200 Mails / 12h** (Log-Tabelle `email_log` bereits vorhanden — Count-Query vor jedem Send).
- **Jitter 400–1200 ms** zwischen zwei Sendungen (existiert bereits in `send-reminders`, in `send-application-reminders` einbauen).
- Bei drei aufeinanderfolgenden SMTP-Fehlern: Tenant auf `emails_paused = true` setzen mit Grund (Auto-Pause, existiert schon für `send-invitation-email`).

Keine neue Queue nötig — der 30-Min-Cron holt beim nächsten Lauf einfach die restlichen Kandidaten nach.

---

## Technische Details (nur für dich)

**Dateien:**
- `src/routes/api/public/applications.ts` — Bewerbungseingang-Block entfernen
- `src/routes/admin.email-templates.tsx` — Tab „Bewerbungseingang" entfernen
- `src/routes/admin.bewerbungen.tsx` — No-Show-Badge, Reminder-Chips, Query auf `application_reminder_log`, Button „No-Show markieren"
- `supabase/functions/send-application-reminders/index.ts` — Cap (40/run), 12h-Cap (200), Jitter, Auto-Pause
- `supabase/functions/send-reminders/index.ts` — `updated_at`-Referenz suchen und entfernen
- ggf. `supabase/manual-migrations/20260710_no_show_status.sql` — Status `no_show` in enum

**Nach Deploy:**
- Frontend: Publish → Update
- Edge Functions: `scripts/deploy-edge-function.sh send-application-reminders` + `send-reminders`

---

## Nicht Teil dieses Plans

- Umgang mit älteren No-Shows (Auto-Ablehnung nach X Tagen) — separater Wunsch, bei Bedarf danach.
- Löschen der `application_received_*` Tenant-Spalten — kann später sauber aufgeräumt werden.

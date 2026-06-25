## Ziel
Vermittlung-Landing und Fasttrack-Landing verbinden, Funnel-Stages umbenennen und ein Anti-Spam-System (max. 3 Reminder → Status `cold`) einführen.

## 1. Migration `20260625000000_vermittlung_link_and_cold.sql`

**`landing_pages`**
- `linked_fasttrack_landing_id uuid REFERENCES landing_pages(id) ON DELETE SET NULL`
- Nur für `flow_type = 'broker'` (Vermittlung) sinnvoll; UI erzwingt das.

**`applications`**
- `source_landing_id uuid REFERENCES landing_pages(id)` (Vermittlung-Page, falls über `?ref=` gekommen)
- `target_landing_id uuid REFERENCES landing_pages(id)` (Fasttrack-Page, wo Bewerbung tatsächlich entstand)
- `status_cold boolean DEFAULT false` + `cold_at timestamptz`
- Index auf `(status_cold, status)` für Cold-Leads-Liste.

**`reminder_log`** (existiert bereits)
- View/RPC: `count_reminders_per_stage(application_id, stage)` für die 3er-Begrenzung.

## 2. Vermittlung-Admin UI
`src/routes/admin.vermittlung.tsx` (bzw. Landing-Editor): Dropdown „Weiterleitung nach Klick → Fasttrack-Page", gefiltert auf eigene Tenant-Landings mit `flow_type = 'fasttrack'`. Persistiert `linked_fasttrack_landing_id`.

## 3. Vermittlung-Renderer / CTA
In `landing-server/server.js` (und `server.ts`): Wenn `flow_type = 'broker'` und `linked_fasttrack_landing_id` gesetzt → CTA-Link wird zu `https://<fasttrack-domain>/?ref=<vermittlung_landing_id>` umgeschrieben. Sonst Standard-Verhalten.

## 4. Fasttrack: `?ref=` einlesen
`src/routes/index.tsx` (bzw. der Landing-Renderer-Client): liest `ref` aus URL, speichert in `sessionStorage('vermittlung_ref')`. `src/routes/api/public/applications.ts` nimmt `source_landing_id` aus dem Body entgegen, validiert UUID + existierend, setzt `target_landing_id = current_landing.id`.

## 5. Bewerbungsgespräch-Gate (bleibt wie heute)
`src/routes/interview.$appId.tsx`: Zugang nur wenn `calendly_event` existiert UND in der Zukunft liegt ODER noch nicht `completed`. Kein Termin → Redirect auf Calendly-Buchungslink. Bestehende Logik beibehalten, nur expliziten Check „Termin in Vergangenheit + nicht completed = darf nachträglich completen" sicherstellen.

## 6. Funnel-Renaming
`src/lib/landing-cohorts.functions.ts` + `landing-funnel.functions.ts`: Stages umbenennen
1. Aufrufe (raw views)
2. Bewerbungen (applications created)
3. Termin gebucht (calendly_booked_at not null)
4. Termin wahrgenommen (interview_status = completed)
5. Registriert (user signed up)
6. Onboarding abgeschlossen

UI: `admin.statistiken.tsx` Labels anpassen.

## 7. Anti-Spam / Cold-Leads
**Edge function** `supabase/functions/send-reminders/index.ts`:
- Vor jedem Reminder: `SELECT count(*) FROM reminder_log WHERE application_id=$1 AND stage=$2`.
- Wenn `>= 3` → `UPDATE applications SET status_cold=true, cold_at=now()` und kein weiterer Reminder.

**Admin UI** `src/routes/admin.applications.index.tsx`:
- Tab/Filter „Cold Leads" (`status_cold = true`).
- Button „Wieder aktivieren" → setzt `status_cold = false`, `cold_at = null` (Counter bleibt → manueller Reminder möglich, automatischer Cron überspringt weiterhin bei `>= 3` pro Stage; daher zusätzlich Stage-Reset-Option).

## Offene Frage
Soll „Wieder aktivieren" den Reminder-Counter pro Stage **zurücksetzen** (= Auto-Reminder laufen neu) oder nur Cold-Flag entfernen (= nur manuell)? Default-Vorschlag: Counter zurücksetzen, sonst bringt's wenig.

## Ziel
Rebook-Feature auf Backend-Server (190.97.167.123) einspielen und danach End-to-End verifizieren, dass das gesamte Bewerbungs- + Reminder-System sauber läuft.

## Was fehlt aktuell auf 123
1. **DB-Migration:** `supabase/manual-migrations/20260715100000_rebook_after_cancel_reminder.sql`
   → fügt Spalten `reminder_app_rebook_subject/_body` in `tenants` hinzu + erweitert CHECK-Constraint auf `application_reminder_log` um `rebook_after_cancel_24h/72h`.
2. **Edge Function:** `supabase/functions/send-application-reminders/index.ts` (aktualisiert mit Rebook-Logik).
3. **Frontend/Webhook:** ist bereits mit `deploy.sh` auf 124 gelandet (Portal läuft), aber der Calendly-Webhook läuft ebenfalls im Portal → ✅ schon aktiv.

## Schritt-für-Schritt (auf 123 per SSH)

### A) Migration einspielen
```bash
ssh root@190.97.167.123
cd /opt/apps/portal        # falls Repo dort auch geklont ist
git pull
docker exec -i supabase-db psql -U postgres -d postgres \
  < supabase/manual-migrations/20260715100000_rebook_after_cancel_reminder.sql
```
Erwartung: `ALTER TABLE`, `NOTIFY`, keine Fehler.

Verifikation:
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "\d public.tenants" | grep reminder_app_rebook
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint 
   WHERE conname='application_reminder_log_reminder_kind_check';"
```

### B) Edge Function deployen
```bash
cd /opt/apps/portal
supabase functions deploy send-application-reminders \
  --project-ref <PROJECT_REF> --no-verify-jwt
```
(oder falls self-hosted CLI-Weg nicht geht: neuen Container-Ordner nach `/var/lib/supabase/functions/send-application-reminders/` kopieren und `docker restart supabase-edge-functions`.)

### C) Cron-Job prüfen
```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE '%application_reminders%';
```
Muss aktiv sein (alle 30 Min).

## Verifikation (End-to-End)

### 1. SMTP-Health & Templates
```sql
SELECT id, name, reminder_app_rebook_subject IS NOT NULL AS rebook_ready,
       bewerbung_magic_link_subject IS NOT NULL AS invite_ready
FROM tenants;
```

### 2. Reminder-Dry-Run
```bash
curl -X POST https://<supabase-url>/functions/v1/send-application-reminders \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"dry_run": true}'
```
Erwartung: JSON mit `candidates`-Array, keine Errors.

### 3. Live-Szenario Rebook (echter Test)
- Test-Bewerber im Calendly-Widget einer Fast-Track-Landing buchen
  → `applications.booking_status='scheduled'` + `magic_token` gesetzt
- Termin in Calendly stornieren
  → Webhook setzt `booking_status='cancelled'`
- 24h später (oder `updated_at` manuell zurücksetzen zum Testen):
  → Function schickt `rebook_after_cancel_24h` E-Mail
- Bewerber bucht neuen Termin über Calendly-Link
  → derselbe `magic_token` bleibt aktiv, `booking_status='scheduled'`,
     alte Rebook-Log-Einträge werden gelöscht
- Magic-Link öffnen → Interview zeigt neuen Termin ✅

### 4. Logs prüfen
```sql
SELECT action, status, target, created_at 
FROM automation_log 
WHERE action LIKE 'calendly.%' OR action LIKE 'reminder.%'
ORDER BY created_at DESC LIMIT 30;

SELECT * FROM application_reminder_log 
ORDER BY created_at DESC LIMIT 20;
```

### 5. Chat-Reminder + Interview-Timeout
```sql
SELECT jobname, schedule, active FROM cron.job;
```
Muss enthalten: `auto_timeout_stale_interviews`, `send_appointment_reminders`, `send_application_reminders`, `send_chat_reminder`.

## Bei Fehlern
- **Migration failed** → SQL-Output posten, meist Constraint-Konflikt weil alte Werte drin sind → SQL zum Bereinigen liefere ich dann.
- **Edge Function 500** → `docker logs supabase-edge-functions --tail 100`.
- **Cron läuft, aber keine Mails** → `email_send_log` + `tenants.smtp_health` prüfen.

## Nach erfolgreicher Verifikation
Zusammenfassung an dich: welche 11 E-Mail-Typen aktiv sind, welche Cron-Jobs laufen, ob Rebook-Flow durchgängig funktioniert.

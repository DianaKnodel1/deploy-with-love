
## Status Deploy Portal-Server

Deploy lief sauber durch:
- git pull ✓
- build ✓ (48s)
- portal.service läuft ✓

**Aber:** Schritt 3/4 sagt „keine Manual-Migrations oder TARGET_DB_URL nicht gesetzt — übersprungen". Das bedeutet: alle neuen SQL-Migrations (u.a. **45-Min-Interview-Timeout**, `interview_auto_timeout`, `registration_pending_reminder` etc.) sind **noch nicht in der DB**. Ohne die läuft der Timeout weiter auf dem alten Wert (bzw. 20 Min) und Bewerber-Chats brechen weiter zu früh ab.

## Was zu tun ist

### Schritt 1 — `TARGET_DB_URL` in Portal-`.env` hinterlegen (einmalig)

Auf dem Portal-Server:

```bash
# Prüfen ob schon vorhanden
grep TARGET_DB_URL /opt/apps/portal/.env

# Falls leer → hinzufügen (Passwort aus Supabase-Server holen)
nano /opt/apps/portal/.env
# Zeile ergänzen:
# TARGET_DB_URL=postgres://postgres:<DB-PASSWORD>@<SUPABASE-HOST>:5432/postgres
```

Das `<DB-PASSWORD>` ist das Postgres-Passwort deines self-hosted Supabase. Falls unklar: liegt in der Supabase-`.env` unter `POSTGRES_PASSWORD`. Host ist meist die IP des Supabase-Servers (Server 3) oder `127.0.0.1` wenn Portal + Supabase auf derselben Kiste laufen.

### Schritt 2 — Deploy erneut ausführen (spielt Migrations ein)

```bash
bash /opt/apps/portal/scripts/deploy.sh
```

Erwartete Ausgabe in Schritt 3/4: mehrere `· 2026xxxxx_xxx.sql → einspielen…` + `✓ … angewendet`. Wenn eine Migration bereits läuft, wird sie einfach übersprungen — kein Risiko.

### Schritt 3 — Landing-Server (Server 1, `uwkconsulting`, 190.97.165.213) updaten

Für den Logo-Cache-Buster-Fix in `landing-server/server.js`:

```bash
# Von deinem lokalen Rechner ODER vom Portal-Server aus:
scp /opt/apps/portal/landing-server/server.js \
    root@190.97.165.213:/opt/apps/landing-server/server.js

ssh root@190.97.165.213 'systemctl restart landing.service && \
  systemctl status landing.service --no-pager | head -n 8'
```

### Schritt 4 — Kurz-Verifikation

```bash
# Portal reachable?
curl -sI https://mb-portal.com | head -n 1        # → 200

# Landing Cache-Header vorhanden?
curl -sI https://<eine-live-landing>/logo | grep -i cache-control  # → no-cache

# Timeout aktiv (via psql)?
psql "$TARGET_DB_URL" -c "SELECT pg_get_functiondef('public.auto_timeout_stale_interviews'::regproc);" | grep "45 minutes"
```

## Wenn du das Postgres-Passwort nicht hast

Alternativen:
1. Auf Supabase-Server (Server 3): `grep POSTGRES_PASSWORD /opt/supabase/.env`
2. Oder: Migrations manuell per `psql` von Supabase-Server aus einspielen (dort ist Postgres lokal ohne Passwort erreichbar).

Sag Bescheid welchen Weg du gehen willst, dann geb ich dir den exakten Befehl.

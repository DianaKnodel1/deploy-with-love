# Plan: Landing-Pages vollautomatisch live schalten

## Was du willst (in meinen Worten)

1. Du klickst im Portal auf **„Landing erstellen"** → wählst Theme, füllst Daten aus, lädst Logo hoch.
2. Klick auf **„Live schalten"** → System macht automatisch:
   - Landing in DB speichern
   - Domain bei **Cloudflare** anlegen (DNS-Record auf den richtigen Landing-Server)
   - Landing-Server erkennt die Domain und rendert die Page mit Auto-SSL
3. Du kannst **jederzeit neue Landing-Server dazustellen** (Server 1a, 1b, 1c...). Das System verteilt neue Landings automatisch auf einen freien Server. Alte Landings bleiben auf ihrem alten Server.
4. Wenn ein Server voll/kaputt ist → neuen Server registrieren, fertig.

Das ist genau, was dein Kollege gebaut hat (siehst du im Screenshot: **Domains / Registrars / Cloudflare / Mailers / Servers / Operations**). Wir bauen die gleiche Logik — angepasst auf dein bestehendes System.

---

## Architektur (neu)

```
                          ┌─────────────────────────┐
                          │   PORTAL (Server 2)     │
                          │   mb-portal.com         │
                          │   - Landing-Generator   │
                          │   - Server-Pool-Verw.   │
                          │   - Cloudflare-API      │
                          └────────────┬────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  SUPABASE (Server 3)    │
                          │  - landing_pages        │
                          │  - landing_servers ←NEU │
                          │  - cloudflare_zones ←NEU│
                          └────────────┬────────────┘
                                       │ (anon-key read)
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
      ┌───────▼────────┐      ┌────────▼───────┐      ┌────────▼───────┐
      │ LANDING-SRV 1a │      │ LANDING-SRV 1b │      │ LANDING-SRV 1c │
      │ Caddy + Bun    │      │ Caddy + Bun    │      │ Caddy + Bun    │
      │ IP: x.x.x.10   │      │ IP: x.x.x.11   │      │ IP: x.x.x.12   │
      │ ~50 Landings   │      │ ~30 Landings   │      │ ~0 Landings    │
      └────────────────┘      └────────────────┘      └────────────────┘
```

---

## Was du im Admin-Portal kriegst (neue UI)

### 1. Tab "Server" (in `/admin/domains` oder neuer Bereich)
Liste aller Landing-Server mit:
- Name (z.B. "Landing-Pool-EU-1")
- IP / Hostname
- Status (online / offline — automatischer Health-Check alle 2 Min)
- Anzahl gehosteter Landings
- Kapazität (z.B. max 100) und Auslastung
- Buttons: **„Neuen Server registrieren"**, **„Pausieren"**, **„Entfernen"**

### 2. Tab "Cloudflare" (Account-Setup)
- Cloudflare API-Token einmalig eintragen (gespeichert als Secret)
- Account-ID
- Test-Button: „Verbindung prüfen"
- Liste der verwalteten Zones

### 3. Landing-Generator (bestehend, erweitert)
Neuer Button: **„Speichern & live schalten"** macht in dieser Reihenfolge:
1. Logo/Favicon in Storage
2. DB-Eintrag in `landing_pages` (mit `server_id` = nächster freier Server aus Pool)
3. Cloudflare-API:
   - Zone anlegen (falls Domain neu) → zeigt dir Nameserver für Domain-Registrar
   - **ODER** wenn Zone schon existiert: A-Record `@` und `www` → Server-IP setzen
4. Anzeige: „✅ Live auf https://kunde-domain.de — Cert kommt in ~30s"

### 4. Tab "Operations" (Activity-Log)
Was wurde wann automatisiert: „Landing X erstellt", „Cloudflare-Record gesetzt", „Server-Health-Check failed" — debugbar.

---

## Datenmodell

**Neue Tabellen** (zusätzlich zum bestehenden `landing_pages`):

```sql
landing_servers (
  id, name, hostname, ip, capacity, current_count,
  status, last_health_check, created_at
)

cloudflare_zones (
  id, domain, zone_id, account_id, status, nameservers[], created_at
)

automation_log (
  id, action, target, status, payload, error, created_at
)
```

**Erweiterung `landing_pages`:** `server_id` (welcher Server hostet diese Landing).

---

## Wie ein neuer Server dazu kommt (deine Frage: „Server 1 ist nicht fest")

1. Du mietest einen neuen VPS (Hetzner/Contabo/whatever).
2. Im Portal: **„Neuen Server registrieren"** → IP eintragen.
3. Portal zeigt dir **einen Befehl** zum Copy-Paste:
   ```
   curl -sSL https://mb-portal.com/api/public/server-bootstrap?token=xyz | bash
   ```
4. Das Script auf dem Server installiert: Bun, Caddy, lädt `server.ts` runter, legt Env-Vars an, startet systemd-Service.
5. Server meldet sich beim Portal mit Heartbeat → erscheint als „online" in der Liste.
6. Ab sofort werden neue Landings auf diesen Server verteilt (Round-Robin oder „least full").

**Bestehende Landings auf alten Servern:** bleiben unangetastet. Migration nur, wenn du es willst (Button „Migriere zu anderem Server").

---

## Cloudflare-Automation (Details)

Wenn du eine Landing live schaltest:

**Fall A: Kunde nutzt seine eigene Domain (z.B. `bewerbung-mueller.de`)**
- Domain liegt beim Kunden-Registrar
- Portal kann nicht automatisch DNS setzen
- Anzeige: **„Bitte beim Registrar einen A-Record auf X.X.X.X setzen"**

**Fall B: Domain liegt schon in Cloudflare (in deinem Account)**
- Portal nutzt Cloudflare-API → setzt A-Record automatisch
- ✅ Sofort live

**Fall C: Du registrierst Domain für Kunden**
- Manuell beim Registrar kaufen
- Cloudflare-Zone anlegen (Portal-Button) → Portal zeigt CF-Nameserver
- Beim Registrar Nameserver eintragen
- Danach: vollautomatisch wie Fall B

Für **alle drei Fälle** funktioniert SSL automatisch über Caddy `on_demand_tls`.

---

## Technische Umsetzung (kurz, für später)

- **Cloudflare-API-Client:** `src/lib/cloudflare.functions.ts` — Server-Fn die mit Bearer-Token Zones/Records verwaltet.
- **Server-Pool-Logik:** `src/lib/landing-server-pool.functions.ts` — wählt beim Speichern den Server mit niedrigster Auslastung.
- **Bootstrap-Endpoint:** `src/routes/api/public/server-bootstrap.ts` — generiert das Setup-Script mit eingebetteten Env-Vars (Token, Supabase-URL/Key).
- **Heartbeat-Endpoint:** `src/routes/api/public/server-heartbeat.ts` — Server pingt alle 60s, updated `last_health_check` + `current_count`.
- **Health-Cron:** markiert Server als offline wenn 5 Min kein Heartbeat.
- **Admin-UI:** neuer Bereich `/admin/infrastructure` mit Tabs Servers / Cloudflare / Operations.
- **Secrets:** `CLOUDFLARE_API_TOKEN`, `LANDING_SERVER_BOOTSTRAP_SECRET`.

---

## Was bleibt wie es ist

- Bestehender Landing-Server-Code (`landing-server/`) — wird der Standard-Stack für jeden neuen Server im Pool.
- Bewerbungs-API auf Server 2 — unverändert.
- ZIP-Export — bleibt als Fallback.
- Mitarbeiter-Portal — unverändert.

---

## Was ich von dir brauche, bevor ich baue

1. **Cloudflare-Setup:** Hast du einen Cloudflare-Account, in den ich Kunden-Domains automatisch reinwerfen darf? Oder bleibt jede Kunden-Domain beim jeweiligen Kunden-Cloudflare-Account?
2. **Server-Verteilung:** Soll ich „Round-Robin" (gleichmäßig verteilen) oder „Least-Full" (immer der leerste Server zuerst) nehmen? Empfehlung: **Least-Full** + 100-Landings-Cap pro Server.
3. **Bootstrap-Security:** Einverstanden mit Token-basiertem Bootstrap (Token rotierbar, einmal generieren pro Server)?
4. **Reihenfolge:** Baue ich zuerst (a) Server-Pool + Bootstrap, dann (b) Cloudflare-Automation? Oder umgekehrt? Empfehlung: **Server-Pool zuerst** — dann kannst du heute schon deinen ersten Server hinzufügen, Cloudflare kommt danach.

Sobald du die 4 Fragen beantwortet hast, klick **„Implement plan"** und ich bau das.

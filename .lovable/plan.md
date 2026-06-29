## Ziel

"Klassisch" aus UI ausblenden. Neuer Bewerbungs-Flow: Vermittlung → Calendly → E-Mail mit Magic-Link → Fasttrack `/bewerbung` → KI-Interview. Direkter Zugang auf Fasttrack-Landings leitet auf das Mitarbeiter-Portal weiter.

## Flow im Überblick

```text
Vermittlung-Landing (personalservice-gmbh.de)
        │ CTA klick
        ▼
   Broker-Modal "Wir verbinden Sie mit <Partner>"
        │ Jetzt Termin buchen
        ▼
Calendly (Event-Type der verknüpften Fasttrack-Firma)
        │ Buchung mit E-Mail + utm_source=<broker_landing_id>
        ▼
Calendly-Webhook → Portal
    • application anlegen (flow_type=fast, source = Broker)
    • Magic-Link generieren (Token in applications.magic_token)
    • E-Mail "Ihr Bewerbungsgespräch" an Invitee
        │ Klick auf Link
        ▼
Fasttrack-Landing  https://<fasttrack-domain>/bewerbung?token=...
    • Token → Application laden → direkt ins KI-Interview
    • Ohne Token: Redirect auf Mitarbeiter-Portal (Login)
```

## Änderungen

### 1. UI: "Klassisch" ausblenden
- `src/routes/admin.landing-generator.tsx`: `flow_type`-Auswahl filtert `classic` raus. Bestehende classic-Landings bleiben funktional, neue Pages nur noch `fast` / `broker`.
- `src/routes/admin.applications.index.tsx`: Filter-Dropdown ohne "Klassisch".
- `src/lib/landing-pages.functions.ts`: kein Schema-Change, nur Default `flow_type='fast'`.

### 2. Calendly-Webhook erweitert
- `src/routes/api/public/calendly-webhook.ts` (bestehend): bei `invitee.created` zusätzlich:
  - Application-Row anlegen (oder bestehende per E-Mail mergen)
  - `magic_token` (uuid) generieren + `magic_token_expires_at` (7 Tage)
  - via `sendTransactionalEmail` Template `bewerbung-magic-link` schicken mit `https://<fasttrack-domain>/bewerbung?token=<uuid>`
  - `<fasttrack-domain>` aus verknüpfter Landing (utm_source = broker_landing_id → linked_fast_landing → domain)

### 3. DB-Migration
- `applications.magic_token text unique`, `magic_token_expires_at timestamptz`
- Index auf `magic_token`
- GRANT bleibt unverändert (service_role schreibt, RPC liest)

### 4. RPC für Token-Lookup
- `get_application_by_magic_token(_token text)` security definer, liefert `application_id, status, interview_state` wenn Token gültig + nicht abgelaufen.

### 5. `/bewerbung` umbauen
- `src/routes/bewerbung.index.tsx`:
  - Query-Param `token` lesen
  - **Mit Token**: RPC aufrufen → bei Treffer Redirect/Embed `/interview/$appId`; sonst Fehler "Link ungültig oder abgelaufen".
  - **Ohne Token**: Redirect auf `<portal_url>/login` (aus `window.PORTAL_URL`, vom Landing-Renderer injiziert) — kein Bewerbungs-Formular mehr.

### 6. E-Mail-Template
- `src/lib/email-templates/bewerbung-magic-link.tsx` mit Branding der Firma (logo_url, primary_color aus Landing-branding) und CTA-Button auf den Link. In `registry.ts` registrieren.

### 7. Landing-Server
- `landing-server/server.js`: Broker-Modal-Text & Calendly-Link bleiben. Nur Fasttrack-CTAs (kein broker, kein bewerbung-Modal mehr nötig auf Fasttrack-Page direkt) zeigen — Direktbewerbung über Landing ist deaktiviert; CTA-Click ohne Token öffnet `/bewerbung` → das redirectet aufs Portal.

## Offene Klärung vor Code
Soll der Magic-Link **direkt** auf `/interview/$appId` führen (ohne `/bewerbung`-Zwischenseite), oder bleibt `/bewerbung?token=` als Landing mit Branding + "Jetzt Gespräch starten"-Button (vermeidet versehentliches Auto-Mic-Recording beim E-Mail-Preview-Aufruf durch Spam-Scanner)?

Empfehlung: **`/bewerbung?token=`** als Zwischenseite mit Button — Mail-Scanner triggern sonst das Interview.

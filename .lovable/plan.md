# Plan: Calendly-Bewerbungsflow (wie AZB-Personal → Equal Experts)

## Ziel

Den Conversion-starken Flow deines Kollegen 1:1 nachbauen:

```text
Bewerbungsformular abschicken
   ↓
Loader-Modal "Ihre Daten werden verarbeitet…"
   ↓
Zwischenseite "Sie werden mit [Firma] verbunden" + "Jetzt Termin buchen"
   ↓
Calendly (mit vorausgefüllten Daten: first_name, last_name, email, phone)
   ↓
Nach Buchung → Webhook trifft uns → Application-Status "Termin gebucht"
   ↓
Bewerber kommt per Calendly-Bestätigungsmail/Confirmation zurück zur Registrierung
```

Das KI-Interview (Sabine-Schneider-Style) bauen wir bewusst **erst danach** in einem eigenen Schritt — siehe "Nicht in diesem Schritt".

---

## Was gebaut wird

### 1. Datenbankschema erweitern (neue Migration)

Neue Migration `supabase/manual-migrations/20260618100000_calendly_integration.sql`:

**Tabelle `landing_pages` erweitern:**
- `calendly_url text` — Calendly Booking-Link pro Landing (z.B. `https://calendly.com/sabine-schneider/bewerbung`)
- `intermediate_company_name text` — Anzeigename für Zwischenseite ("Equal Experts Germany GmbH")
- `intermediate_logo_url text` — optional Firmenlogo
- `redirect_delay_ms int default 2500` — wie lange Loader angezeigt wird (0 = manueller Button)

**Tabelle `applications` erweitern:**
- `calendly_event_uri text` — Calendly Event-URI (eindeutig pro Buchung)
- `calendly_invitee_uri text`
- `scheduled_at timestamptz` — gebuchter Termin
- `booking_status text default 'pending'` — `pending` | `scheduled` | `cancelled` | `no_show` | `completed`

**Neue Tabelle `calendly_accounts` (pro Tenant):**
- `id`, `tenant_id`, `display_name`, `calendly_user_uri`, `webhook_signing_key` (für Signatur-Verifikation), `personal_access_token` (verschlüsselt, optional für API), `created_at`

Mit GRANTs + RLS + `docs/MIGRATIONS.md` Update.

### 2. Zwischenseite — neue Route `/bewerbung/verbinden`

Datei: `src/routes/bewerbung.verbinden.tsx` (öffentlich, kein Login)

- Liest Query-Parameter: `?landing=<slug>&first_name=&last_name=&email=&phone=`
- Lädt Landing-Page-Daten per public Server-Function `getLandingPublicFn`
- Zeigt:
  - Loader-Modal mit Spinner (wie AZB)
  - Text: "Ihre Daten werden verarbeitet… Bitte schließen Sie nicht das Fenster"
  - Nach `redirect_delay_ms` automatisch zur Calendly-URL mit angehängten Query-Params (`?first_name=…&last_name=…&email=…&a1=phone`)
- Im Hintergrund: POST an `/api/public/applications-prebook` → erzeugt `application`-Eintrag mit `booking_status='pending'`, gibt `application_id` zurück, hängt sie als `?utm_source=lovable&app_id=<uuid>` an Calendly-URL (Custom Question im Calendly-Event füllt dann später Webhook-Daten zurück)
- Fallback: Falls Calendly nicht konfiguriert → Hinweis "Bitte HR kontaktieren"

### 3. Bewerbungsformular-Submit anpassen

In `src/components/landing/ApplicationForm.tsx` (bzw. dem aktuellen Submit-Handler in `admin.landing-generator.tsx`-Preview und der echten Public-Landing):

- Submit-Logik: statt direkt `/register?email=…` zu redirecten → wenn Landing `calendly_url` gesetzt hat, leite zu `/bewerbung/verbinden?landing=<slug>&first_name=…` weiter
- Wenn `calendly_url` leer → bisheriger Flow bleibt (Fast/Classic)

### 4. Calendly-Webhook empfangen

Neue öffentliche Route: `src/routes/api/public/calendly-webhook.ts`

- POST-Endpoint mit HMAC-SHA256 Signatur-Verifikation (`Calendly-Webhook-Signature` Header, `webhook_signing_key` aus `calendly_accounts`)
- Events:
  - `invitee.created` → `applications.booking_status = 'scheduled'`, `scheduled_at`, `calendly_event_uri`, `calendly_invitee_uri` setzen; Matching über Email + neueste `pending` Application des Tenants
  - `invitee.canceled` → `booking_status = 'cancelled'`
- Schreibt `automation_log` Eintrag (Audit)
- Stabile URL für Calendly: `https://project--1fa4f177-7059-471c-8755-648e9cbc6047.lovable.app/api/public/calendly-webhook`

### 5. Admin-UI: Calendly konfigurieren

**Neue Route:** `src/routes/admin.calendly.tsx`
- Liste aller `calendly_accounts` des Tenants
- "Neuen Account hinzufügen": Display-Name, Calendly-Username/URI, Webhook-Signing-Key
- Anleitung: Wie Webhook in Calendly registrieren (mit Copy-Button für Webhook-URL)

**In `admin.landing-generator.tsx`:**
- Neues Feld im Landing-Editor: "Calendly-Buchungslink" (Dropdown der Accounts ODER Direkteingabe URL)
- Felder: `intermediate_company_name`, `intermediate_logo_url`, `redirect_delay_ms`
- Vorschau-Button: "Zwischenseite ansehen"

**In `admin.applications.index.tsx`:**
- Neue Spalte/Filter: `booking_status` mit Badge (gelb=pending, grün=scheduled, rot=cancelled)
- Spalte `scheduled_at` mit Datum/Uhrzeit
- Filter "Nur Termin gebucht"

### 6. Funnel-Statistik erweitern (`FunnelPanel`)

In `admin.landing-generator.tsx` → FunnelPanel:
- Neue Stufe einbauen: **Bewerbung → Termin gebucht → Registrierung → Onboarding**
- Drop-off zwischen "Bewerbung" und "Termin gebucht" sichtbar machen (das ist die Stelle, an der dein Kollege gewinnt)

---

## Reihenfolge der Implementierung

1. Migration schreiben + `docs/MIGRATIONS.md` updaten
2. Webhook-Route + `applications-prebook` API
3. Zwischenseite `/bewerbung/verbinden`
4. Submit-Anpassung im Bewerbungsformular
5. Admin-UI: `calendly_accounts` + Landing-Felder
6. Applications-Liste erweitern (booking_status)
7. FunnelPanel-Stufe ergänzen

Jeder Schritt einzeln testbar. Du musst nur einmal in Calendly den Webhook eintragen (URL kopieren), den Rest erledigt der Code.

---

## Was du als User tun musst

1. **Migration ausführen** (in Supabase SQL Editor, wie in `docs/MIGRATIONS.md`)
2. **In Calendly:** Webhook anlegen mit der Lovable-URL → Signing-Key in Admin → Calendly eintragen
3. **Pro Landing:** Calendly-Link + Firmenname für Zwischenseite eintragen
4. **Testen:** Bewerbung absenden → Loader → Calendly → Termin buchen → in Admin als "scheduled" sehen

---

## Nicht in diesem Schritt (bewusst später)

- **KI-Interview-Chat (Sabine Schneider Persona)** — kommt als Schritt 2, sobald Calendly-Flow live ist und du echte Drop-off-Zahlen siehst
- **ElevenLabs Voice / TTS** — kommt mit Schritt 2
- **Eigener Kalender** statt Calendly — nur wenn Calendly-Kosten/Limits stören

---

## Technische Details

- **Calendly-Pre-fill Format:** `https://calendly.com/<user>/<event>?first_name=X&last_name=Y&email=Z&a1=PHONE&utm_source=lovable&utm_content=<application_id>` — Calendly liefert `utm_content` im Webhook im `tracking`-Feld zurück → exakte Application-Zuordnung statt nur Email-Matching
- **Signatur-Verifikation:** `crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))` mit HMAC-SHA256 über raw body
- **Idempotenz:** Webhook prüft `calendly_event_uri` (UNIQUE) → doppelte Zustellung wird ignoriert
- **RLS:** `calendly_accounts` und `applications.booking_status` über Tenant-Scope; Webhook nutzt `supabaseAdmin` (verifizierte Quelle)
- **Vorhandene Server-Fn-Konvention:** `src/lib/calendly.functions.ts` (Admin-CRUD), `src/lib/applications.functions.ts` erweitern für `booking_status`-Updates

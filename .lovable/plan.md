# Plan: Dritter Bewerbungs-Modus „Vermittlung" (Broker / AZB-Style)

Ziel: Drei Flow-Modi pro Landing, alle vollständig über das Portal konfigurierbar – ohne Calendly-Konfig im Code anfassen zu müssen.

## 1. Die drei Modi (Auswahl pro Landing-Page)

| Modus | Verhalten nach „Bewerbung absenden" |
|---|---|
| **Klassisch** | Bewerbung landet im Portal, Status `pending`, Admin akzeptiert manuell, danach E-Mail mit Registrierungslink. (heute schon vorhanden) |
| **Fast Track** | Bewerbung wird automatisch akzeptiert, Bewerber wird sofort zu `/register?email=…` weitergeleitet. (heute schon vorhanden) |
| **Vermittlung** *(neu, AZB-Style)* | Bewerbung wird gespeichert (`booking_status='pending'`), Bewerber sieht Zwischenseite „Wir verbinden Sie mit **[Partnerfirma]**" → klickt „Jetzt Termin buchen" → Calendly mit vorausgefüllten Daten → nach Buchung Webhook → Status `scheduled` → Calendly schickt Einladungs-Mail mit Link auf `portal.<tenant>/register?email=…&app=…`. |

Auswahl im Landing-Generator als 3-Kachel-Picker (heute 2 Kacheln).

## 2. Alles im Portal konfigurierbar

### A) Globale Calendly-Accounts (`/admin/calendly` – existiert bereits)
- Account-Name (z.B. „Sabine Schneider")
- Calendly-User-URI (optional)
- Webhook Signing Key
- Webhook-URL zum Kopieren

### B) Partner-Firmen (`/admin/partner-firmen` – **neu**)
Damit dieselbe Partnerfirma auf mehreren Landings wiederverwendet werden kann.
Felder pro Partner:
- Firmenname (z.B. „Equal Experts Germany GmbH")
- Logo (Upload)
- Calendly-Buchungslink (`https://calendly.com/sabine-schneider/bewerbung`)
- Calendly-Account-Referenz (für Webhook-Verifikation)
- Portal-Ziel-URL (Registrierung) – z.B. `https://portal.digital-dgigmbh.com/register`
- E-Mail-Absender-Name (für Einladungsmail)
- Texte für Zwischenseite (Headline, Subline, Button-Label) – mit Defaults

### C) Landing-Page-Editor (`/admin/landing-generator` – erweitern)
- Flow-Modus: Klassisch / Fast Track / **Vermittlung**
- Bei „Vermittlung":
  - Partner-Firma auswählen (Dropdown aus B)
  - Override: eigener Calendly-Link, eigener Firmenname, eigenes Logo (optional)
  - Loader-Dauer (ms), 0 = nur Button
  - Toggle „Einladungs-E-Mail aktiv" (Mail kommt aus Portal, nicht Calendly)
  - Toggle „Auch klassische Mitarbeiter-Registrierung erlauben" (für später)

### D) Bewerber-Liste (`/admin/applications` – erweitern)
- Neue Spalte **Buchungs-Status** mit Badges: `pending` / `scheduled` (mit Datum) / `cancelled` / `no_show` / `completed`
- Filter nach Buchungs-Status
- In Bewerber-Detail: Calendly-Event-Link, Termin-Datum, Reschedule/Cancel-URL

### E) Funnel-Panel (`FunnelPanel`) – erweitern
Neue Stufe für Vermittlung-Landings:
```text
Bewerbung gesendet → Zwischenseite gesehen → Calendly geöffnet → Termin gebucht → Registriert → Onboarding
```

### F) E-Mail-Templates (`/admin/email-templates`)
Neues Template **„Vermittlungs-Einladung"** (was AZB als „Markus Schuster"-Mail verschickt, Screenshot 3): Variablen `{{bewerber_vorname}}`, `{{partner_firma}}`, `{{calendly_link}}`, `{{portal_url}}`. Wird ausgelöst, sobald Bewerbung mit Vermittlungs-Flow eingeht.

## 3. End-to-End-Ablauf „Vermittlung"

```text
[Landing /jobs/xyz]
   │ submit
   ▼
POST /api/public/applications
   │ flow_type='broker' → insert application (booking_status='pending')
   │ E-Mail-Queue: Vermittlungs-Einladung an Bewerber
   ▼
Redirect → /bewerbung/verbinden?app=<id>&landing=<slug>&first_name=…
   │ Loader-Modal: „Wir verbinden Sie mit [Partnerfirma]"
   │ Auto-Redirect (oder Button) nach n ms
   ▼
Calendly mit ?first_name=…&email=…&utm_content=<application_id>
   │ Bewerber bucht Slot
   ▼
Calendly-Webhook → /api/public/calendly-webhook
   │ HMAC-Verify, matche utm_content → application
   │ UPDATE booking_status='scheduled', scheduled_at=…
   ▼
[Optional jetzt:] Bestätigungs-Mail mit Registrierungslink
   ▼
Nach Termin: Bewerber klickt Portal-Link → /register?email=…&app=…
   │ Registrierung im Tenant-Portal, Application wird mit User verknüpft
```

## 4. Was bauen wir konkret (Code-Tasks)

1. **DB-Migration** `20260619000000_broker_flow.sql`
   - `applications.flow_type` Check erweitern um `'broker'`
   - Neue Tabelle `partner_companies` (id, tenant_id, name, logo_url, calendly_url, calendly_account_id, portal_register_url, intro_headline, intro_subline, button_label, created_at) + GRANTs + RLS (admin-only schreiben, anon SELECT nur safe Felder via View `partner_companies_public`)
   - `landing_pages.partner_company_id` FK + Override-Felder (bereits da: `calendly_url`, `intermediate_company_name`, …)
   - Neues E-Mail-Template Seed: `broker_invitation`

2. **Server-Functions** `src/lib/partner-companies.functions.ts` – CRUD wie `calendly.functions.ts`

3. **Admin-UI** `src/routes/admin.partner-companies.tsx` – Liste + Wizard (mit Logo-Upload via existierender Storage)

4. **Landing-Generator** – 3-Kachel-Picker, Vermittlungs-Sektion mit Partner-Dropdown + Overrides, Validierung („Vermittlung braucht Partner ODER Calendly-URL")

5. **`/api/public/applications`** – `flow_type='broker'` Branch:
   - Insert mit `booking_status='pending'`
   - Trigger Vermittlungs-Einladungs-Mail (bestehende Email-Pipeline)
   - Return `redirect_url: /bewerbung/verbinden?…`

6. **`/bewerbung/verbinden`** – bereits gebaut, nur: Partner-Firma aus `partner_company_id` joinen statt nur aus Landing-Branding lesen.

7. **`/api/public/calendly-webhook`** – bereits gebaut, ergänzen:
   - Bei `invitee.created` Bestätigungs-Mail mit Portal-Link senden
   - Bei `invitee.canceled` → Reschedule-Mail

8. **Bewerber-Liste & Detail** – Buchungs-Status-Spalte, Filter, Detail-Card mit Calendly-Daten

9. **FunnelPanel** – Broker-Funnel-Stufen + Drop-off-Anzeige

10. **Sidebar** – „Partner-Firmen" unter „Calendly"

## 5. Was wir NICHT in diesem Schritt bauen

- KI-Chat-Interview „Sabine Schneider" (kommt als nächster Schritt nach erfolgreichem Calendly-Flow)
- ElevenLabs Voice
- Eigenes Buchungsmodul (Calendly-Ersatz)
- White-Label-Domain für die Zwischenseite (läuft erstmal auf Tenant-Portal-Domain)

## 6. Was du danach selbst tun musst

1. Migration via Supabase SQL Editor ausführen
2. Unter `/admin/calendly` Signing Key eintragen + Webhook in Calendly registrieren
3. Unter `/admin/partner-firmen` mindestens eine Partnerfirma anlegen
4. In bestehender oder neuer Landing den Modus „Vermittlung" wählen + Partner zuweisen
5. End-to-End testen: Bewerbung absenden → Zwischenseite → Calendly → Webhook prüft in `/admin/applications` durch

---

Sag Bescheid wenn der Plan so passt, dann setze ich um. Falls du Punkte streichen/ergänzen willst (z.B. „Partner-Firmen brauche ich nicht, immer nur 1 pro Landing direkt eintragen"), sag es jetzt – das verkleinert den Build deutlich.

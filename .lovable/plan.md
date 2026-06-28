# End-to-End Testlauf — kompletter Bewerber-Flow

## Ziel
Einmal durchspielen: **personalservice-gmbh.com** (Vermittlung) → Bewerbung → Weiterleitung an **UWK Consulting** (Fast-Track) → Calendly-Termin → KI-Bewerbungsgespräch → Chat.

---

## Phase 1 — Setup im Admin (einmalig)

### 1.1 Fast-Track-Firma „UWK Consulting" anlegen
`/admin/partner-companies` → **Neue Fast-Track-Firma**
- Name: `UWK Consulting`
- Logo-URL
- Calendly-URL: `https://calendly.com/<uwk>/erstgespraech`
- Portal-Registrierungs-URL: `https://portal.uwk-consulting.com/register`
- Intro-Headline/Subline (optional, sonst Default)

### 1.2 Calendly-Account verknüpfen
`/admin/calendly` → **Neuer Account**
- Display-Name: `UWK Sabine`
- PAT eintragen → Webhook „Generieren" klicken (signiert + registriert automatisch)

### 1.3 Fast-Track-Landing „UWK" erstellen
`/admin/landing-generator` → **Neue Landing**
- Flow-Typ: **Fast-Track**
- Domain: `karriere.uwk-consulting.com`
- Slug: `uwk`
- Branding (Farben, Logo, Recruiter-Name z.B. „Sabine Schneider")
- KI-Interview: **aktiv** (Sprache: DE, Modell: Gemini 2.5 Flash via apinet)
- Portal-Redirect: `https://portal.uwk-consulting.com/register`
- Speichern → Publizieren

### 1.4 Vermittlungs-Landing „personalservice" erstellen
`/admin/landing-generator` → **Neue Landing**
- Flow-Typ: **Vermittlung**
- Domain: `personalservice-gmbh.com`
- Slug: `home`
- Fast-Track-Firma: **UWK Consulting** (erbt Calendly + Portal)
- Verknüpfte Fast-Track-Landing: **UWK** (für CTA-Redirect mit `?ref=<broker_id>`)
- Speichern → Publizieren

---

## Phase 2 — Bewerber-Flow durchspielen

### 2.1 Vermittlung
1. Bewerber öffnet `https://personalservice-gmbh.com`
2. Füllt Formular aus → POST `/api/public/applications`
3. Application angelegt: `flow_type=broker`, `booking_status=pending`, `source_landing_id=<personalservice>`
4. Inline-Erfolgs-Modal: „Wir verbinden Sie mit **UWK Consulting**" + Button **„Jetzt Termin buchen"**

### 2.2 Calendly
5. Klick → öffnet Calendly in neuem Tab (mit Prefill name/email)
6. Bewerber bucht Termin
7. Calendly-Webhook trifft `/api/public/calendly-webhook` → `booking_status=scheduled`, `scheduled_at=<datum>`
8. Calendly schickt Bestätigungs-E-Mail mit Termin

### 2.3 Übergang zu Fast-Track (am Termintag)
9. Bewerber bekommt Reminder mit Link zur Fast-Track-Landing `karriere.uwk-consulting.com?ref=<broker_id>`
10. Klickt → Fast-Track-Bewerbung (oder Kurzform „Termin bestätigt, weiter")
11. Application erweitert: `flow_type=fast`, `target_landing_id=<uwk>`, Auto-Akzept

### 2.4 KI-Interview
12. Weiterleitung zu `/interview/<appId>` (KI-Recruiterin Sabine)
13. ElevenLabs-Voice-Agent + Gemini-LLM führen Gespräch
14. Transkript + Score wird auf `applications` gespeichert
15. Nach Abschluss: Redirect zu Portal-Registrierung

### 2.5 Portal + Chat
16. Bewerber registriert sich im Portal → `profiles`-Row, Rolle `employee`
17. Admin sieht Bewerbung unter `/admin/applications/<id>` mit Transkript
18. Chat zwischen Admin/Recruiter und Bewerber via `/admin/chat`

---

## Phase 3 — Was ich jetzt brauche, um loszulegen

Vor dem Implementieren bitte bestätigen:

1. **Sind alle Migrations auf der Backend-DB schon ausgeführt?**
   - `20260619000000_broker_flow.sql`, `20260618100000_calendly_integration.sql`, `20260625000000_vermittlung_link_and_cold.sql`, `20260626000000_ai_settings_agent_apinet.sql`, `20260628100000_landing_recruiter_name.sql`
2. **Existieren bereits Daten** (UWK-Firma, Calendly-Account, Landings) oder soll ich von Null starten?
3. **Test-Modus**: echter Calendly-Account + Domains live, oder nur Smoke-Test auf `localhost` mit Mock-Webhook?

## Was ich dann tue
- **Lücken im Code identifizieren** (z.B. fehlt evtl. die `?ref=`-Auswertung auf Fast-Track-Landings, oder der automatische Übergang von `broker`-App → `fast`-App nach Calendly-Webhook).
- Pro Lücke ein gezielter Patch, kein großes Refactoring.
- Am Ende: Checkliste mit `curl`-/UI-Schritten, mit der du den Flow auf deinen Servern verifizieren kannst.

Sag mir, wo wir stehen (Punkte 1–3), dann fange ich an.

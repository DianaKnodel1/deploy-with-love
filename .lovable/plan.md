# Offene Punkte – haarscharf durchgegangen

Stand des Codes: Broker-Grundgerüst steht (Migration-Datei, Partner-CRUD, `/bewerbung/verbinden`, Webhook-Empfang, Landing-Generator-Picker). **Das eigentliche „Drum-herum" ist noch lückenhaft.** Hier alles, was offen ist – sortiert nach Wichtigkeit.

## A. Broker-Flow: harte Lücken (Code existiert, aber unvollständig)

1. **Migrationen noch nicht ausgeführt** (manuell)
   - `20260618100000_calendly_integration.sql`
   - `20260619000000_broker_flow.sql`
   - Ohne diese laufen Webhook, Partner-CRUD und `booking_status` ins Leere.

2. **Calendly-Webhook → keine Bestätigungsmail**
   `calendly-webhook.ts` setzt nur `booking_status='scheduled'`. Es wird **keine** Mail an den Bewerber ausgelöst (Plan-Punkt 7 + E). Fehlt:
   - Trigger „broker_invitation"-Template bei `invitee.created`
   - Reschedule-Mail bei `invitee.canceled`

3. **E-Mail-Template `broker_invitation` existiert nicht**
   - Kein Seed, kein Eintrag in `email_templates`, kein Edge-Function-Aufruf.
   - Variablen wie `{{partner_firma}}`, `{{calendly_link}}`, `{{portal_url}}` müssen verdrahtet werden.

4. **Bewerber-Liste & -Detail zeigen `booking_status` nicht**
   - Keine Badge-Spalte in `admin.applications.index.tsx`
   - Kein Filter „Nur gebuchte / no_show / cancelled"
   - Detail-View zeigt keinen Calendly-Event-Link, kein Termin-Datum, keine Reschedule/Cancel-URL

5. **Landing-Tabelle zeigt Vermittlung nicht**
   `admin.landing-generator.tsx` Zeile 624 kennt nur `fast` und `classic` Badges. „🤝 Vermittlung" fehlt.

6. **FunnelPanel: Broker-Stufen fehlen komplett**
   `landing-funnel.functions.ts` hat keine Broker-Logik. Stufen „Zwischenseite gesehen → Calendly geöffnet → gebucht" sind nicht messbar.

7. **Sidebar-Eintrag „Partner-Firmen"** prüfen
   `admin.vermittlung.tsx` und `admin.partner-companies.tsx` existieren — aber im `AdminLayout` ist nur ein Eintrag verlinkt. Doppelte/fehlende Navigation klären.

8. **Tracking „Zwischenseite gesehen / Calendly geöffnet"**
   Aktuell kein Event-Log auf `/bewerbung/verbinden`. Ohne das ist Funnel-Panel sinnlos.

## B. Setup-/Doku-Lücken (du musst es einmal tun)

9. Calendly-Account anlegen → Signing Key in `/admin/calendly` eintragen
10. Webhook-URL in Calendly registrieren (`/api/public/calendly-webhook`)
11. Mindestens eine Partner-Firma in `/admin/partner-firmen` anlegen
12. End-to-End-Test: Bewerbung → Zwischenseite → Calendly → `scheduled` im Admin

## C. KI-Interview „drum-herum" (alles außer der Sprach-Engine)

Wenn ElevenAgents später eingestöpselt wird, muss das Drum-herum bereits stehen:

13. **DB-Schema `interview_sessions`**
    - `id, application_id, partner_company_id, status (pending/in_progress/completed/failed), started_at, ended_at, duration_sec, transcript jsonb, audio_url, ai_score int, ai_summary text, ai_flags jsonb`
    - GRANTs + RLS (admin lesen, anon nur eigenes via Token)

14. **Storage-Bucket `interview-audio`** (privat, signed URLs)

15. **Bewerber-Einstiegspunkt definieren**
    - Variante A: Direkt nach Bewerbung absenden, vor Calendly (Vorqualifizierung)
    - Variante B: Statt Calendly (KI = der Termin)
    - Variante C: Nach Calendly-Termin, asynchrone Hausaufgabe
    → **Frage an dich: Welche Variante?**

16. **Bewerber-Route `/interview/[token]`**
    - Token-basierter Zugang (keine Login-Pflicht)
    - Mic-Permission, Vorab-Briefing-Bildschirm, Start-Button, Live-Status, Beenden-Button
    - Platzhalter-Box wo später der `useConversation`-Hook reinkommt

17. **Admin-Konfiguration Interview-Persona**
    - Pro Partner-Firma oder pro Landing: `interview_prompt` (Systemprompt), `interview_questions` (Leitfragen), `interview_voice_id`, `interview_duration_max_min`
    - UI in `/admin/partner-firmen` als zusätzliche Tabs

18. **Admin-Auswertung im Bewerber-Detail**
    - Tab „Interview" mit: Audio-Player, Transcript-Reader (Bewerber/KI farblich), KI-Zusammenfassung, Score, Red-Flags, Empfehlung „Einstellen / Ablehnen / Weiter"

19. **E-Mail-Template `interview_invitation`**
    - Mit eindeutigem Token-Link

20. **Edge-Function `interview-evaluate`**
    - Wird vom KI-Interview-Ende getriggert → schickt Transcript an LLM → speichert `ai_summary, ai_score, ai_flags`

21. **Secrets-Slots vorbereiten** (noch keine Werte)
    - `ELEVENLABS_API_KEY` als geplanter Secret-Name dokumentieren

22. **Funnel-Stufe ergänzen**: „Interview gestartet → abgeschlossen → bewertet"

## D. Optionales Feintuning

23. Whitelabel: Zwischenseite `/bewerbung/verbinden` aktuell auf Tenant-Portal-Domain — soll sie auf Landing-Domain laufen?
24. DSGVO-Hinweis auf Zwischenseite + Interview-Start („Gespräch wird aufgezeichnet")
25. Limit Interview pro Bewerber (genau 1 Versuch?)

---

## Vorschlag Reihenfolge

**Block 1 – Broker fertig machen** (Punkte 1–8): erst hier sauber zu Ende.
**Block 2 – Setup** (9–12): du machst es manuell, ich liefere Klick-Anleitung.
**Block 3 – Interview-Schale** (13–22): komplettes Drumherum mit Platzhalter für die Voice-Engine.
**Block 4 – ElevenAgents einstecken** (zum Schluss, separat).

---

**Bitte beantworte vor Implementierung:**

- (a) Soll ich **Block 1 komplett** in einem Rutsch fertigbauen oder die Punkte einzeln?
- (b) Welche **Interview-Variante (A/B/C in Punkt 15)** willst du?
- (c) Punkt 23: Zwischenseite auf Landing-Domain oder Portal-Domain belassen?


## Status vorab

**Recruiter-Name ist bereits dynamisch.** `landing_pages.recruiter_name` (Migration `20260628100000_landing_recruiter_name.sql`) wird in `interview-engine.server.ts` + `interview-chat.ts` gelesen und in `{recruiter}` ersetzt. „Sabine Schneider" ist nur Default, wenn keiner gesetzt ist. → Kein Code-Change nötig, im Landing-Generator pro Page änderbar.

**Offene Punkte aus den letzten Nachrichten** — alles erledigt bis auf:
- Paket 1 (Personen-Seite)
- Paket 2 (E-Mail-Center Redesign)
- Paket 4 (Theme-Verify)
- DNS-Auto-Anlage für `portal.<domain>` (in `admin.tenants.tsx` integriert, aber noch nicht live verifiziert — kommt bei nächstem Tenant automatisch)

---

## Paket 1 — Personen-Seite

**Neu:** `src/routes/admin.personen.tsx`

**Datenquelle:** Vereinte Sicht `applications` + `profiles` + `bookings`. Eine Person = entweder eine `application` (noch nicht registriert) oder ein `profile` (Mitarbeiter), verbunden über `application_id` falls vorhanden.

**Phase-Spalte (berechnet, nicht aus DB-Status):**

```text
📅 Termin offen         → application, keine booking
⏰ Termin gebucht        → booking.scheduled_at > jetzt
⚠️ Überfällig           → booking.scheduled_at < jetzt - 30min, kein interview_completed_at
🎙 Interview läuft       → interview_started_at, kein interview_completed_at
✅ Angenommen           → recommendation = invite, kein profile
❌ Abgelehnt            → recommendation = reject
🟡 Wird geprüft         → interview_completed_at, recommendation = unsure
👤 Mitarbeiter          → profile.registered_at gesetzt, !is_active=false
🚀 Onboarded           → onboarding_completed_at gesetzt
```

**UI:** Tab-Bar oben mit den Phasen + Count-Badge. Tabelle: Name, E-Mail, Phase, Quelle (Landing), Letzte Aktivität, Aktionen (Detail-Link).

**Sidebar:** „Bewerbungen" + „Mitarbeiter" werden zu einem Eintrag „Personen". Alte Routen (`admin.applications.index`, `admin.employees.index`) werden zu Redirects auf `/admin/personen?tab=…`. Detail-Routen (`admin.applications.$appId`, `admin.employees.$userId`) bleiben unverändert.

---

## Paket 2 — E-Mail-Center Redesign

**Komplett-Rewrite** von `src/routes/admin.email-center.tsx`. Tabs raus, eine Scroll-Seite.

```text
┌─ Heute ──────────────────────────────────────────┐
│  ✅ X zugestellt   ⏳ Y unterwegs   ⚠ Z Fehler   │
└──────────────────────────────────────────────────┘

┌─ Aktive E-Mails (Bewerber→Mitarbeiter Flow) ─────┐
│ Pro aktive Mail:                                  │
│  Icon · Name · Trigger-Beschreibung               │
│  Letzte Sendung: vor X min · Anzahl 24h           │
│  [Vorschau] [Testmail an mich] [Vorlage]          │
└──────────────────────────────────────────────────┘

┌─ Letzte Sendungen (Log) ─────────────────────────┐
│ Recipient · Template · Status · Zeit             │
│ Filter: Suche, Template, Status                  │
└──────────────────────────────────────────────────┘

┌─ Erweitert (Akkordeon) ──────────────────────────┐
│  Cron-Health · Recovery · Reminders alt          │
└──────────────────────────────────────────────────┘
```

**Aktive Mails (in dieser Reihenfolge angezeigt) — nach neuem Flow:**

| # | Mail | Trigger | Edge-Function |
|---|------|---------|---------------|
| 1 | 📅 Calendly-Bestätigung | Auto: Calendly → Webhook | (Calendly nativ) |
| 2 | ⏰ No-Show 2h Reminder | Cron 10min, scheduled_at + 2h, kein interview_completed_at | send-appointment-reminders |
| 3 | ⏰ No-Show 24h Reminder | Cron 10min | send-appointment-reminders |
| 4 | ⏰ No-Show 72h Reminder | Cron 10min | send-appointment-reminders |
| 5 | 🎉 Willkommen im Team | Auto: KI-Recommendation = invite | send-invitation-email |
| 6 | 📨 Reg-Reminder | Cron: invite versendet > 24h, nicht registriert | send-reminders |
| 7 | ⏱ 30-Min Termin-Reminder | Cron: scheduled_at - 30min | send-appointment-reminders |
| 8 | 🔑 Passwort zurücksetzen | Manuell: Mitarbeiter klickt „Passwort vergessen" | send-password-reset |
| 9 | 💬 Chat-Reminder | Manuell: Admin sendet aus Chat | send-chat-reminder |

**Deaktivierte/tote Mails** (raus aus Liste, im Akkordeon „Erweitert > Veraltet" gelistet falls noch im Code):
- Bewerbungseingang-Mail (Broker-Flow schickt nichts mehr)
- Alte Recovery-/Reminder-Templates (`reminder_no_partner` etc.)

**Bonus:** `docs/EMAIL_FLOW.md` als Referenz für dich — eine Tabelle mit allen Edge-Functions, Triggern, Templates, Status (aktiv/tot).

---

## Paket 4 — Theme-Verify

**Playwright-Vergleich** für die 4 neuen Themes:
1. `theme-cle-beratung` vs `https://cle-beratung.de`
2. `theme-tts-beratung` vs `https://tts-beratung.de`
3. `theme-for-tel` vs `https://for-tel.solutions`
4. `theme-job-gleiter` vs `https://job-gleiter.com`

**Pro Theme:**
- Side-by-side Screenshot (Desktop 1280×1800, Mobile 375×800)
- Check: keine 404 Bilder, Form rendert, Hero-Text matcht
- Fehlt ein Bild 1:1, lade ich es vom Original und tausche im Theme-Ordner
- Speichern in `/tmp/browser/theme-diff/<slug>-{desktop,mobile}.png` für deine Review

**Output:** Kurze Liste „Theme X: ✅ ok / ⚠ Bild Y fehlt, ersetzt / ❌ Layout-Problem Z".

---

## Reihenfolge & Aufwand

| # | Paket | Aufwand |
|---|-------|---------|
| 1 | Personen-Seite | ~45 min |
| 2 | E-Mail-Center Redesign + Doku | ~60 min |
| 4 | Theme-Verify + Bildfix | ~30 min |

**Reihenfolge:** 1 → 2 → 4. Pakete sind unabhängig — fällt eins um, bleiben die anderen stehen.

## Fragen

1. **Personen-Detailseite:** Soll Klick auf eine Person in der Tabelle zur bestehenden Detail-Route führen (`admin.applications.$appId` bzw `admin.employees.$userId`) oder eine neue unified Detail-Seite bauen? **Empfehlung:** alte Routen behalten, weniger Bruch.
2. **E-Mail-Center „Testmail":** OK wenn die Testmail an die eingeloggte Admin-E-Mail geht (nicht eingebbar)?
3. **Tote Mails:** Im Code lassen + nur aus UI nehmen, oder Edge-Functions auch löschen? **Empfehlung:** nur aus UI nehmen, Code-Cleanup separat.

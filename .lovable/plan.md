
Ich packe das in **5 Arbeitspakete**. Reihenfolge nach Wirkung: erst das, was du täglich siehst (Personen + E-Mail-Center), dann KI/Themes.

---

## Paket 1 — Personen-Seite (Bewerbungen + Mitarbeiter zusammenlegen)

**Neu:** `src/routes/admin.personen.tsx` mit Tab-Filter:
- `Alle` · `📅 Termin offen` · `⏰ Termin gebucht` · `⚠️ Überfällig (No-Show)` · `🎙 Interview läuft` · `✅ Angenommen` · `❌ Abgelehnt` · `👤 Mitarbeiter` · `🚀 Onboarded`

**Status-Spalte → „Phase":** abgeleitet aus `applications` + `bookings` + `profiles.registered_at` + `is_active` + `onboarding_completed_at`. Kein DB-Status mehr direkt anzeigen — Phase ist berechnet.

**Alte Seiten:** `admin.applications.index.tsx` + `admin.employees.index.tsx` werden Redirects auf `/admin/personen?tab=…` (kein Code-Verlust, alle Detail-Routen bleiben).

**Sidebar:** „Bewerbungen" + „Mitarbeiter" → ein Eintrag **„Personen"**.

---

## Paket 2 — E-Mail-Center Redesign

**Problem heute:** 5 Tabs, 4 KPIs, Tabelle mit 6 Spalten pro Template — sieht aus wie ein Monitoring-Dashboard, ist aber für dich (Operator) gedacht.

**Neuer Aufbau** (`admin.email-center.tsx`):

```
┌─ Heute (Live) ───────────────────────────────────┐
│  ✅ 47 zugestellt    ⏳ 3 unterwegs    ⚠ 0 Fehler │
└──────────────────────────────────────────────────┘

┌─ Aktive E-Mails (was wann rausgeht) ─────────────┐
│ 📅 Calendly-Bestätigung    automatisch nach Buchung
│ ⏰ No-Show 2 h             Cron, alle 10 min
│ ⏰ No-Show 24 h            Cron
│ ⏰ No-Show 72 h            Cron
│ 🎉 Willkommen im Team      nach KI-Annahme
│ 🔑 Passwort zurücksetzen   manuell
│ 📨 Reg-Reminder            Cron
│ 💬 Chat-Reminder           manuell
│ ⏱ 30-Min-Reminder          Cron
│   → Klick öffnet Template-Editor + Vorschau     │
└──────────────────────────────────────────────────┘

┌─ Letzte Sendungen (Log) ─────────────────────────┐
│  Empfänger · Template · Status · vor X min       │
│  Filter: Suche, Status, Template, Zeitraum       │
└──────────────────────────────────────────────────┘
```

- Tabs raus, alles eine Scroll-Seite.
- Pro Template direkt sichtbar: **Trigger** + **letzte Sendung** + **„Testmail an mich"**-Button.
- Tote Templates (`reminder_no_partner`, alte Drafts) werden in `tenants`/Edge-Functions deaktiviert oder gelöscht.
- Reminders/Recovery/Cron-Health bleiben als **Akkordeon „Erweitert"** unten (für Debug, nicht im Alltag).

**Recherche-Output (parallel):** Ich erstelle dir `docs/EMAIL_FLOW.md` mit:
- Welche Edge-Function feuert wann
- Welcher Cron triggert was
- Welches Template wird wo verwendet
- Welche sind tot

---

## Paket 3 — KI-Chat menschlicher

In `interview.voice.$appId.tsx` + `interview.$appId.tsx`:
- **Tippindikator** (3 Punkte) bevor Antwort kommt
- **Natürliche Pause** 800–1500 ms (random) zwischen Antworten
- **Erste Nachricht warmer**: „Hi {name}, schön dass du dir Zeit nimmst! 😊 Ich bin Sabine…"
- **Filler im Prompt**: „mhm", „verstehe", „okay, spannend" als zulässige Wortbausteine
- **Voice**: ElevenLabs-Stimme auf wärmere Variante (z.B. „Charlotte" statt Default)
- Keine Aufzähl-/Bullet-Antworten — nur Fließtext, max 2 Sätze pro Turn

---

## Paket 4 — Themes verifizieren (4 neue)

Playwright-Vergleich pro Theme:
1. Render `http://localhost:8080/preview/theme-{slug}` Screenshot
2. Fetch Original-URL Screenshot
3. Side-by-side `/tmp/browser/theme-diff/{slug}.png`
4. Check: alle Bilder geladen (kein 404), Form rendert, Mobile-Breakpoint hält

Themes: `cle-beratung`, `tts-beratung`, `for-tel`, `job-gleiter`.

Bilder: aktuell teils noch Platzhalter — ich tausche fehlende durch hochgeladene/generierte 1:1-Versionen.

---

## Paket 5 — Sidebar-Cleanup

```
Übersicht
Personen          ← (Bewerbungen + Mitarbeiter)
Aufgaben
Chat
Termine
Bestellungen
Statistiken
─────────
Einstellungen ▾
  E-Mail-Center
  Landing Generator
  Domains
  Infrastruktur
  Calendly
  Partner
  Vermittlung
  Team-Leader
  System
```

---

## Reihenfolge & Aufwand

| # | Paket | Aufwand | Sichtbarkeit |
|---|-------|---------|--------------|
| 1 | Personen-Seite + Phase-Spalte | ~45 min | sehr hoch |
| 2 | E-Mail-Center Redesign + Doku | ~60 min | hoch |
| 3 | KI-Chat menschlicher | ~20 min | mittel |
| 5 | Sidebar Cleanup | ~10 min | hoch |
| 4 | Theme-Verify + Bildfix | ~30 min | niedrig |

**Mein Vorschlag:** 1 → 5 → 2 → 3 → 4. Soll ich genauso loslegen, oder andere Reihenfolge?

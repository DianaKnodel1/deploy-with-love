
# Fix-Paket: Migrations, Funnel, Infrastruktur-UX

## Problem heute

1. **Schema-Cache-Fehler**: `landing_servers` und `landing_pages` existieren in der DB nicht — Migrationen `20260617…landing_pages.sql`, `20260618…landing_infrastructure.sql` und `20260616100000_applications_funnel.sql` sind noch nicht eingespielt.
2. **Funnel-Panel** zeigt rohen SQL-Error (`column applications.source_slug does not exist`) statt eines verständlichen Hinweises.
3. **Server-Anlegen-Dialog** schließt einfach, ohne den Bootstrap-Befehl (`curl … | sudo bash`) prominent zu zeigen — du wüsstest also nicht, was du als Nächstes auf dem VPS tun musst.

---

## 1) Migrations-Guide

Neue Datei `docs/MIGRATIONS.md` mit klarer Reihenfolge:

```
1. supabase/manual-migrations/20260616100000_applications_funnel.sql
2. supabase/manual-migrations/20260617000000_landing_pages.sql
3. supabase/manual-migrations/20260618000000_landing_infrastructure.sql
```

Anleitung: Supabase Dashboard → SQL Editor → einfügen → Run. Für jede Migration:
- was sie tut (1 Satz)
- woran man erkennt, dass sie erfolgreich war (Check-Query)

Außerdem: Im Infrastruktur-Panel **oben einen Banner** „Migration fehlt — hier klicken für Anleitung", **wenn** der Tabellen-Fehler auftritt.

## 2) Funnel-Panel fehlertolerant

`src/routes/admin.landing-generator.tsx` (Funnel-Block):
- Fehler abfangen: wenn die DB `source_slug`/`is_test` nicht kennt → freundliche Karte:
  > „Funnel-Tracking noch nicht aktiv. Migration `20260616100000_applications_funnel.sql` ausführen, dann erscheinen hier Konversionsraten."
- Kein roter SQL-Text mehr für Nicht-Techies.
- Tooltip am Titel „Funnel: Bewerbung → Registrierung → Onboarding" mit Klartext-Erklärung („Zeigt, wie viel Prozent der Bewerber sich registrieren und das Onboarding fertig machen. Hilft zu sehen, wo Leute abspringen.").
- Tooltip am Zeitraum (30d/90d…): „Über welchen Zeitraum die Konversionsraten gerechnet werden."

## 3) Infrastruktur-UX

**A. Bootstrap-Modal nach „Anlegen"**

Neue Komponente in `src/routes/admin.infrastructure.tsx`:
- Nach erfolgreichem `createLandingServer` öffnet sich ein Modal:
  - Schritt 1: „Logg dich per SSH auf deinen VPS (`{ip}`) ein."
  - Schritt 2: Großer Code-Block mit dem One-Liner + **Copy-Button**.
  - Schritt 3: „Warte ~60s. Der Status springt automatisch von `pending` auf `online`."
- Sicherheitshinweis: „Der Token ist nur einmal vollständig sichtbar. Du kannst ihn jederzeit über die Server-Zeile rotieren."

**B. Copy-Button in der Server-Zeile**

In der Server-Liste (für jeden Server):
- Status-Badge (pending/online/offline/paused)
- Button „Bootstrap-Befehl kopieren" (öffnet dasselbe Modal mit aktuellem Token)
- Button „Token rotieren" (ruft `rotateBootstrapToken` auf)
- Button „Pausieren / Löschen"

**C. Klares Empty-State-Onboarding**

Wenn kein Server existiert:
- 3-Schritte-Karte: „1. VPS bestellen → 2. Hier ‚Server hinzufügen' → 3. One-Liner auf VPS ausführen"
- Link zum Migrations-Guide, falls die Tabelle gar nicht da ist.

---

## Technische Details

**Geänderte Dateien**
- `src/routes/admin.landing-generator.tsx` — Funnel-Block: Try/Catch + Migrations-Hint, Tooltips.
- `src/routes/admin.infrastructure.tsx` — Bootstrap-Modal-State, Empty-State, Buttons pro Zeile, Migrations-Banner bei Tabellen-Fehler.
- `src/lib/landing-servers.functions.ts` — kleine Hilfsfunktion `getBootstrapCommand({ baseUrl, token })` (rein clientseitig nutzbar, gibt den `curl`-String zurück, damit Modal und Zeilen-Button denselben String zeigen).

**Neue Dateien**
- `docs/MIGRATIONS.md` — Schritt-für-Schritt-Anleitung für alle 3 Migrationen + Check-Queries.
- `src/components/admin/LandingServerBootstrapDialog.tsx` — wiederverwendbares Modal (3-Schritt-Anleitung, Copy, Status-Hinweis).

**Keine Schema-Änderungen.** Alles, was an der DB fehlt, ist in den drei vorhandenen Migrations-Dateien — die werden vom User per SQL-Editor angewendet.

---

## Out of scope (mache ich NICHT in diesem Schritt)

- Cloudflare-Account-UI verbessern (kommt in Folge-Iteration)
- Automatischer Tabellen-Existenz-Check als globales Health-Panel
- Funnel-Tracking inhaltlich erweitern (nur fehlertolerant machen)

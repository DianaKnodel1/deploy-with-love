# Verbesserungspunkte — Review /admin/bewerbungen + Bewerber-Flow

Ich habe die Bewerber-Seite (Admin), den Chat-Prompt, die E-Mails und den WelcomeAccepted-Screen durchgesehen. Hier sind die Punkte, die mir wirklich auffallen — sortiert nach Wirkung. Sag mir welche (Nummern), und ich baue sie.

---

## A) `/admin/bewerbungen` — UX & Klarheit

**A1. Phasen-Chips sind zu viele (11 Stück nebeneinander)**
Aktuell: „Alle · Kein Termin · Termin gebucht · Abgesagt · No-Show · Interview läuft · Zusage · Abgelehnt · Registriert · E-Mail bestätigt · Onboarding fertig · Mitarbeiter aktiv" — auf schmalen Screens ein Wrap-Chaos.
Vorschlag: 3 Gruppen mit Zähler-Badges:
`Alle · Offen (kein Termin / gebucht / no-show) · Im Interview · Entschieden (Zusage/Absage) · Mitarbeiter (registriert…aktiv)`
Klick öffnet ein Sub-Filter.

**A2. „Kein Termin" ist mehrdeutig**
Bedeutet aktuell sowohl „noch nie gebucht" als auch „Termin abgelaufen ohne Buchung". Umbenennen in **„Wartet auf Buchung"** + Tooltip mit Alter der Bewerbung („vor 3 Tagen beworben, keine Buchung").

**A3. E-Mail-Status-Badge braucht Kontext**
Aktuell: grün / rot / orange / grau. Beim Hover sieht man den Grund, aber kein Zeitstempel.
Vorschlag: `✉️ Gesendet · vor 2 Std` direkt sichtbar bei den kritischen Zeilen (No-Show, Kein Termin).

**A4. Schnellaktionen pro Zeile**
Bulk-Delete gibt's schon. Fehlt in der Zeile: **„Reminder jetzt senden"** (manueller Trigger, überschreibt Idempotenz mit `force=true`) und **„Neuen Magic-Link generieren"** — beides Standard-Support-Fragen.

**A5. Interview-Transkript-Preview**
Beim Öffnen eines Bewerbers wird das Transkript gezeigt — aber ohne Score/Empfehlung oben. KI-Score (0–100) + Empfehlungs-Badge groß nach oben, Transkript darunter.

**A6. Sortierung**
Default aktuell nach `created_at`. Für die Tabs „No-Show" / „Kein Termin" wäre **`interview_completed_at DESC`** bzw. `created_at ASC` (ältester zuerst = dringendster) sinnvoller.

---

## B) Bewerber-Texte (Landing → Chat → E-Mail → Registrierung)

**B1. Landing „Danke"-Screen**
Aktuell: „Vielen Dank. Wir melden uns per E-Mail."
Besser: „**Fast geschafft! In den nächsten 60 Sek. bekommst du eine E-Mail von uns mit deinem persönlichen Interview-Link.** Bitte auch im Spam-Ordner schauen — Absender: `bewerbung@…`"

**B2. Bewerbungseingang-Mail (Betreff)**
Aktuell vermutlich: „Ihre Bewerbung ist eingegangen"
Besser: **„✅ Bewerbung erhalten – nächster Schritt: dein Interview (5 Min)"**
Body: klare 3-Schritt-Timeline, Button „Interview jetzt starten", P.S. mit Support-Kontakt.

**B3. Chat-Eröffnung des KI-Recruiters**
Schon verbessert („Hallo {firstName}…"). Zusätzlich: **eine Erwartungs-Zeile** in Nachricht 1: „Das Gespräch dauert ca. 8–12 Min. Sie können jederzeit Rückfragen stellen."

**B4. Chat-Absage-Text**
Aktuell wirkt die Absage bei „reject" abrupt. Vorschlag empathischer:
„Vielen Dank für Ihre Zeit und Offenheit. Nach diesem Gespräch passt die Position aktuell leider nicht — das liegt oft an Zeitrahmen oder Modell, nicht an Ihnen persönlich. Wir behalten Ihre Unterlagen gerne im Blick, falls eine passendere Rolle frei wird."

**B5. Zusage-Screen (`WelcomeAccepted`)**
Momentan: Checkliste + „E-Mail kommt gleich". Fehlt: **direkter Button „Jetzt weiter zur Registrierung"** (Magic-Link ist ja bereits erzeugt) — nicht auf Mail warten lassen. Das war schon besprochen, ist aber m.W. noch nicht drin.

**B6. „Herzlichen Glückwunsch"-E-Mail**
Betreff ist gut. Body-Vorschlag: **Zeitangaben konkreter** — statt „zeitnah" → „**heute noch** freischalten, damit du morgen mit dem ersten Auftrag starten kannst".

**B7. No-Show-Mail**
Aktuell neutral. Vorschlag zwei-stufig:
- Nach 2 Std: freundlich („Termin verpasst? Kein Problem, hier neu buchen: …")
- Nach 24 Std: dringlicher („Letzte Erinnerung — dein Platz wird sonst vergeben")

**B8. „Kein Termin"-Reminder**
Aktuell nach 4 Tagen. Zu spät — Bewerber sind da meist schon woanders.
Vorschlag: **24 h · 72 h · 7 Tage** (drei Stufen), Text jeweils eskalierend.

---

## C) Technisch / Kleinigkeiten

**C1. `computePhase`** in `admin.bewerbungen.tsx` — Logik verzweigt in ~10 Zweigen. Als Unit-Test absichern (aktuell keiner), sonst brechen künftige Änderungen still.

**C2. `interview-engine.server.ts` Default-Fallback** — `recruiterName = "Sabine Schneider"` als Hardcode. Auf `"unser HR-Team"` ändern, damit alte Landings ohne Recruiter-Name nicht wieder Sabine zeigen.

**C3. Company-Fallback „unserem Unternehmen"** — wenn kein Firmenname gepflegt: statt Fallback lieber im Admin-UI eine Warnung „Firmenname fehlt in Branding" mit Direkt-Link.

**C4. Chat-Timeout** — falls Bewerber 5 Min inaktiv ist, sollte nach 10 Min automatisch `finalizeInterview` laufen (aktuell hängt der Chat offen, kein Status-Update, kein Score). Cron oder client-seitiger Ping.

---

## Empfehlung Reihenfolge

**Runde 1 (heute, hoher ROI, wenig Risiko):**
B1, B2, B5 (Direkt-Button Registrierung), B6, A2, A6, C2

**Runde 2 (nächster Deploy):**
A1, A3, A4, B4, B7, B8

**Runde 3 (technisch):**
C1, C3, C4, A5

---

Sag mir: **welche Nummern** soll ich in Runde 1 machen? Oder gib mir grünes Licht für meinen Vorschlag (B1, B2, B5, B6, A2, A6, C2) und ich baue das in einem Rutsch.

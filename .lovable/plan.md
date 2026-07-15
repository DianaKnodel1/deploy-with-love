# Plan: Professionalisierung E-Mail-System + Funnel-Optimierung

Fokus: seriöser Auftritt, weniger Spam, mehr abgeschlossene Buchungen. Alles rückwärtskompatibel – keine bestehende Funktion wird kaputt.

---

## Teil A – Einheitlicher E-Mail-Standard

### A1. Zentraler HTML-Wrapper (`supabase/functions/_shared/email-wrapper.ts`)
Eine Datei, die alle Mails künftig durchlaufen. Enthält:
- **Logo oben** (aus `tenant.logo_url`, fallback: Firmenname als Text)
- **Primärfarbe** für alle Buttons (aus `tenant.primary_color`, fallback #0f172a)
- **Preheader-Text** (versteckt für's Auge, sichtbar im Gmail-Vorschautext)
- **Ansprechpartner-Karte unten** (Name + optional Foto aus `landing_pages.recruiter_name` / `recruiter_avatar`)
- **Footer**: Firmenname · "Antworten Sie einfach auf diese E-Mail" · Impressum-Zeile
- **Automatische Plain-Text-Version** aus dem HTML generiert (Spam-Score ↓)

### A2. Migration aller bestehenden Mail-Funktionen auf den Wrapper
- `send-booking-confirmation` (schon neu, wird angepasst)
- `send-application-reminders` (5 Reminder-Kinds)
- `send-appointment-reminders` (30-Min-vorher)
- `send-invitation-email` (Mitarbeiter-Einladung)
- `send-chat-reminder`
- `send-password-reset`, `resend-signup-confirmation`, `send-signup-confirmation`
- Application-Received-Trigger (in `applications.ts`)

### A3. Konsistente Betreffzeilen
Max. 1 Emoji, gezielt eingesetzt. Neue Konvention:
- Bewerbungseingang: `Ihre Bewerbung bei {tenant} – nächste Schritte`
- Buchungsbestätigung: `✅ Termin bestätigt: {date}, {time} Uhr`
- 30-Min-Reminder: `⏰ Ihr Gespräch beginnt in 30 Minuten`
- No-Show: `Termin verpasst? Neuen Termin buchen`
- Reject-Reminder: kein Emoji

### A4. Spam-Hinweis in kritischen Mails
In `send-booking-confirmation` und Bewerbungseingang:
> 💡 **Tipp:** Sollten Sie in den nächsten Minuten keine Antwort im Posteingang sehen, prüfen Sie bitte kurz Ihren Spam-Ordner und markieren Sie uns als „Kein Spam".

### A5. Reply-To korrekt setzen
Alle Mails: `Reply-To: {tenant.reply_to_email || tenant.sender_email}` – kein no-reply-Feeling.

---

## Teil B – Danke-Seite mit Inline-Erklärung (Bewerbungsformular)

### B1. Bestätigungsdialog nach Absenden verbessert
Im bestehenden `form-section.js` (Landing Page):
- Große grüne Bestätigung: „✅ Bewerbung eingegangen"
- **Neu:** Prominenter Hinweis „**Wichtig:** Prüfen Sie in den nächsten 2 Minuten Ihren Posteingang – **auch den Spam-Ordner**. Sie erhalten den Link zur Terminbuchung."
- **CTA "Jetzt Termin buchen →"** falls Custom-Booking aktiv (führt direkt zu `/termin/<token>` – Token kommt aus der API-Response)
- Fallback (kein Booking-System): der bisherige Modal-Flow bleibt

### B2. API-Response erweitert (`applications.ts`)
Response enthält bereits `redirect_url` bei Fast-Track. Ich ergänze `booking_url` für Vermittlungs-Flow, damit das Modal den Direkt-Link zeigt.

---

## Teil C – Admin: SMTP-Health sichtbar machen

### C1. Health-Panel im Admin-Tenants
- `smtp_health` existiert schon (Status, letzter Check)
- **Neu:** DKIM/SPF/DMARC-Anzeige – wir prüfen die DNS-Records der Sender-Domain per DNS-over-HTTPS (Cloudflare 1.1.1.1)
- Grüner/gelber/roter Punkt pro Record
- Ein Klick "Jetzt prüfen" → Server-Function
- Bei rot: konkrete Anleitung, welchen DNS-Record zu setzen ist

### C2. Neue Server-Function `check-domain-auth.functions.ts`
- Nimmt Domain → prüft SPF (TXT `v=spf1`), DKIM (TXT unter selector `_domainkey`), DMARC (TXT `_dmarc`)
- Speichert Ergebnis in `tenant.smtp_health` (JSON erweitert)

---

## Teil D – Umbuchen-vor-Absagen-Dialog

### D1. Auf `/termin/<token>` (Cancel/Reschedule-Seite)
- Klick auf "Absagen" öffnet **erst** einen Dialog:
  > "Passt der Termin zeitlich nicht?"
  > **[Anderen Termin wählen]** (Primary-Farbe, groß)
  > **[Trotzdem absagen]** (dezent, grau, klein)
- Primary-Klick → Slot-Picker inline (wie bei Erstbuchung, alte Buchung wird atomar gecanceld + neue erstellt)
- Sekundär-Klick → aktueller Absage-Flow

---

## Was ich NICHT anfasse (bewusst)

- Unsubscribe-Link (du willst nicht)
- Calendly-Code (bleibt als Fallback drin)
- Bestehende DB-Struktur der Mails/Templates (nur neue Spalten für Preheader/Reply-To bei Bedarf)
- Interview-Chat-Engine
- Auth/Registrierungs-Flow

---

## Deploy-Reihenfolge (später)

1. Migration `20260718000000_email_professional_upgrade.sql` (Preheader-Spalten, DNS-Auth-Cache)
2. `supabase/functions/*` neu deployen (7 Funktionen)
3. Frontend-Build → Server 124 (Portal) + Server 213 (Landing)

Ich gebe dir am Ende die genauen scp/deploy-Befehle wie immer.

---

## Zeitrahmen

Ich baue alles in **einem Rutsch, sauber, ohne Hetze** – schätze ~8-10 Datei-Änderungen + 1 Migration. Danach testen wir zusammen mit einem echten Test-Bewerber-Flow.

**Sag „go" und ich lege los.**

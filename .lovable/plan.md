Drei Themen, ich schlage diese Aufteilung vor — sag bitte, ob ich alles in einem Rutsch baue oder nur Teil 1+2 zuerst.

---

## 1) Profilbild für die Recruiterin („SS" → echtes Bild)

**Wo gepflegt:** pro Landing Page im Landing-Generator (gleicher Platz wie `recruiter_name`).

**Änderungen:**
- Migration `20260630100000_landing_recruiter_avatar.sql`:
  `ALTER TABLE landing_pages ADD COLUMN recruiter_avatar_url text;`
- Supabase Storage Bucket `recruiter-avatars` (public read).
- `admin.landing-generator.tsx`: Upload-Feld neben „Name der Recruiterin" (Reuse von `compressImage`, gleiches Muster wie team-leader-settings).
- `application-by-token.ts` + `application-lookup.ts`: `recruiter_avatar_url` mitliefern.
- `interview.voice.$appId.tsx` und `interview.$appId.tsx`: Avatar im Header anzeigen, Fallback auf Initialen (heute „SS").

---

## 2) Post-Interview-Flow (Annahme / Ablehnung)

Aktuell endet das Interview im Voice-Screen ohne klare Weiterleitung. Neu:

**Bei `interview_recommendation = 'invite'`:**
- Neue Route `src/routes/interview.success.$appId.tsx`:
  „Willkommen im Team … Jetzt registrieren" → CTA führt auf `/register?app=<token>`.
- `/register` liest den Token, prefillt E-Mail/Name aus `applications`, verknüpft den neuen `auth.users`-Account via `applications.user_id` und setzt `status = 'eingeladen'`.
- Danach automatische Weiterleitung in `_employee/onboarding` (Personalausweis + Arbeitsvertrag).

**Bei `interview_recommendation = 'reject'`:**
- Neue Route `src/routes/interview.rejected.$appId.tsx`:
  Höfliche Absage, kein CTA. `status = 'abgelehnt'`.

**Bei `unsure`:** Hinweis „Wir melden uns per E-Mail", `status = 'in_pruefung'`.

Routing übernimmt `interview-voice.ts` / `interview-chat.ts` beim Abschluss (`end`-Action liefert `redirect_to`).

---

## 3) Funnel-Statistik pro Landing Page

**Neue Route:** `src/routes/admin.statistiken.funnel.$landingId.tsx` (oder Tab in bestehender `admin.statistiken.tsx`).

**Stufen (aus vorhandenen Spalten ableitbar, keine Schema-Änderung nötig):**

| Stufe | Query |
|---|---|
| Bewerbungen eingegangen | `count(applications) WHERE landing_page_id = X` |
| Termin gebucht | `… AND calendly_event_uri IS NOT NULL` |
| Termin wahrgenommen | `… AND interview_started_at IS NOT NULL` |
| Interview angenommen | `… AND interview_recommendation = 'invite'` |
| Interview abgelehnt | `… AND interview_recommendation = 'reject'` |
| Interview nicht wahrgenommen | `calendly_event_uri IS NOT NULL AND interview_started_at IS NULL AND scheduled_at < now()` |
| Registriert | `… AND user_id IS NOT NULL` |
| Onboarding komplett | `… AND status = 'aktiv'` (KYC + Vertrag signed) |
| Onboarding offen | invite + registriert, aber `kyc_status != 'verified'` ODER `contract_signed = false` |

Implementation als ein server fn `getLandingFunnel({ landingId, from, to })` (admin-gated, `requireSupabaseAuth` + `has_role('admin')`), rendert horizontal Funnel mit Conversion-%.

---

**Frage:** Soll ich alle drei Teile jetzt umsetzen, oder zuerst nur Teil 1+2 (User-sichtbar) und Statistik separat?

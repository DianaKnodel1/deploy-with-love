
# Bewerbungsgespräch-System — Aufbauplan

## Konzept

Pro Bewerber entscheidet **du (Admin)** beim Anlegen/Einladen: **Text-Chat (Gemini)** oder **Voice (ElevenLabs + Gemini)**. So kannst du A/B-Conversion sauber messen. Beide Modi laufen auf demselben System-Prompt, demselben Fragenkatalog, derselben Bewertungslogik — nur das Interface unterscheidet sich.

Gemini entscheidet nach jedem Interview **automatisch**: `accepted` oder `rejected`. Regel: Interesse erkennbar + kein Scherz → angenommen → automatisch Vertragsphase. Bei `rejected` → höfliche Absage-Mail.

Hartes Limit: **10 Min pro Interview**, server-seitig durchgesetzt. 1 Interview pro Bewerber (zweites nur per Admin-Reset).

## Reihenfolge (was zuerst)

Ich baue in dieser Reihenfolge, weil jede Stufe für sich nutzbar ist:

### Phase 1 — Fundament & Text-Chat MVP (zuerst)
Begründung: schnellster Weg zu echten Daten. Du kannst sofort testen, Conversion messen, Prompts tunen. Voice baut darauf auf.

1. **DB-Schema** (`interviews`, `interview_messages`, `interview_events`)
2. **Admin: Modus-Auswahl** pro Bewerber (`chat` | `voice`) bei Einladung
3. **Bewerber-Route** `/interview/$token` — Token-basierter Einmal-Link (24h gültig)
4. **Text-Chat UI** (Gemini via Lovable AI Gateway, streaming)
5. **Server-seitiges Zeitlimit** (10 Min ab erstem Message) + Auto-Abschluss
6. **Auto-Bewertung** (Gemini zweiter Call: JSON `{decision, reason, redFlags}`)
7. **Funnel-Event-Logging** bei jedem Schritt

### Phase 2 — Voice (ElevenLabs)
1. ElevenLabs Connector verbinden
2. Server-Route für Conversation-Token (10-Min-Cap im Token-Request)
3. Voice-UI mit `useConversation` Hook
4. Webhook für Transkript-Speicherung → selbe `interview_messages` Tabelle
5. Selbe Auto-Bewertung wie Chat

### Phase 3 — Admin-Auswertung
1. **Funnel-Dashboard** pro Tag/Woche: Beworben → Termin → Wahrgenommen → Interview komplett → Angenommen → Registriert → Vertrag+Ausweis komplett
2. **Interview-Liste** mit Filter (Modus, Score, Datum, Abbruch)
3. **Detail-View**: Transkript + KI-Bewertung + manuelle Override-Möglichkeit
4. **Vergleichsansicht**: Chat-Conversion vs. Voice-Conversion

## Technische Details

### DB-Tabellen (neu)

```sql
-- interviews: ein Datensatz pro Bewerbungsgespräch
interviews (
  id uuid pk,
  application_id uuid fk → applications,
  mode text check in ('chat','voice'),
  token text unique,        -- Einmal-Link
  token_expires_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  status text check in ('pending','in_progress','completed','expired','aborted'),
  ai_decision text check in ('accepted','rejected','review'),
  ai_summary text,
  ai_red_flags jsonb,
  ai_score int,
  created_at timestamptz default now()
)

-- interview_messages: Verlauf (Chat + Voice-Transkripte)
interview_messages (
  id uuid pk,
  interview_id uuid fk,
  role text check in ('user','assistant','system'),
  content text,
  created_at timestamptz default now()
)

-- interview_events: Funnel-Tracking
interview_events (
  id uuid pk,
  application_id uuid fk,
  event_type text,   -- 'applied','appointment_booked','appointment_attended',
                     -- 'interview_started','interview_completed','accepted',
                     -- 'registration_started','registration_completed',
                     -- 'contract_signed','id_uploaded'
  created_at timestamptz default now()
)
```

Plus GRANTs + RLS (Bewerber liest nur per Token, Admin alles).

### Sicherheit
- Token: 32 Zeichen random, 24h Gültigkeit, 1× nutzbar
- Server-seitige Minute-Cap: Server-Function prüft `started_at` vs `now()`, lehnt Messages nach 10 Min ab
- ElevenLabs `conversation_config_override.agent.max_duration_seconds = 600`
- DSGVO-Banner vor Start: "Du sprichst mit einer KI, Transkript wird gespeichert für 6 Monate"

### Stack
- **Text-Chat:** `streamText` (AI SDK) + Lovable AI Gateway, `google/gemini-3-flash-preview`
- **Voice:** `@elevenlabs/react` `useConversation`, WebRTC, Agent mit Gemini-LLM-Backend in ElevenLabs konfiguriert
- **Auto-Bewertung:** Gemini `generateText` mit `Output.object` Schema
- **Server:** `createServerFn` für alles, `/api/public/elevenlabs-webhook` für Transkript-Empfang

## Was ich nicht baue (außer du sagst es)
- Audio-Speicherung (du hast "nur Transkript" gewählt)
- "Mit Mensch sprechen"-Fallback-Button
- Erweiterte KI-Tuning-UI (System-Prompt-Editor) — Prompt erstmal hartcodiert, später konfigurierbar

## Offene Punkte für dich
1. **System-Prompt:** Ich schreibe einen ersten guten Default für Versicherungsvermittler-Recruiting. Du kannst danach im Admin (Phase 3) editieren.
2. **ElevenLabs Voice:** Welche Stimme? Default = deutsch, weiblich, professionell. Du kannst später wechseln.
3. **Fragenkatalog:** Ich nehme 6 Kernfragen (Motivation, Erfahrung, Verfügbarkeit, Gehalt, Vertriebsaffinität, Rückfragen). Kannst du später erweitern.

---

**Sage "los" und ich starte mit Phase 1.** Phase 1 dauert ca. 1 Bauschritt, danach kannst du sofort den Text-Chat testen, bevor wir Voice/ElevenLabs anfassen.

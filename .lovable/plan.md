## Antworten zuerst

### Was ist „Schritt 4 (Landing-Renderer)"?
Deine veröffentlichten Landing Pages (z. B. `uwk-consulting.com`) werden **nicht** vom Lovable-App-Server ausgeliefert, sondern von einem separaten Node-Prozess (`landing-server/server.ts`) auf deinem eigenen Server (Server 1 mit Caddy davor). Der liest die Landing aus der DB und rendert das Theme-HTML.

Das heißt: wenn das Bewerbungs-Flow im gerenderten HTML (z. B. Button „Bewerben" → Chat/Voice UI) erweitert wird, **muss `landing-server/server.ts` neu deployt werden** (auf deinem Server `git pull` + Restart). Sonst sehen Bewerber die alte Version, obwohl in Lovable alles steht.

Aktuell: Der „Bewerben"-Flow auf der Landing schickt Bewerber bereits an `/bewerbung/...` auf der Haupt-App. Die KI-Interview-Routen (`/interview/:id` und `/interview/:id/voice`) liegen ebenfalls in der Haupt-App. **Solange wir nur in der Haupt-App neue Routen anlegen und am Landing-HTML nichts ändern, ist KEIN Re-Deploy des Landing-Servers nötig.** Ich plane das so.

### Landing `uwk-consulting.com` offline nehmen / löschen
Im Admin gibt es bereits den Landing-Generator. Sauberster Weg:
1. **Admin → Landing-Generator → uwk-consulting.com öffnen → „Unpublish"** (setzt `is_published=false`, nach max. 60 s Cache ist die Seite tot).
2. Anschließend im selben Dialog **„Löschen"** → Eintrag aus `landing_pages` raus.
3. DNS bei deinem Registrar (A-Record auf Landing-Server-IP) kann bleiben oder weg — für ein neues Hochladen einfach im Generator neu anlegen.

Falls die UI keinen „Unpublish/Löschen"-Button hat, ergänze ich den als Mini-Schritt 0 (1 Button im Landing-Generator + `deleteLandingPage`-ServerFn). **Frage unten dazu.**

---

## Plan: Schritte 1–3

### Schritt 1 — Chat-Endpoint + Bewerber-Routing (Schrift-Interview)
**Neu:** `src/routes/api/public/interview-chat.ts` (TSS-Route, `/api/public/...`, kein Auth)
- POST `{ applicationId, messages }` → Streaming-Antwort
- Lädt `applications` + `landing_pages.interview_system_prompt` (oder Default-Prompt für Versicherungs-/Finanz-Bewerbung)
- Ruft Lovable AI Gateway, Modell `google/gemini-2.5-flash` (schneller + günstiger als Claude für Chat-Turns, frei während Promo)
- Speichert nach jedem Turn `interview_messages` (jsonb append) via `supabaseAdmin`
- Erkennt „Gespräch beendet" → triggert Summary-Call (zweiter AI-Call mit `interview_summary_prompt`), schreibt `interview_summary`, `interview_score`, `interview_recommendation`, setzt `interview_status='completed'`

**Neu:** `src/routes/interview.$appId.tsx` (öffentlich, kein Auth-Gate)
- Lädt Application + Landing-Settings (über public ServerFn mit narrowem SELECT)
- Wenn `interview_mode === 'voice'` → Redirect auf `/interview/$appId/voice`
- Sonst: Chat-UI (eigenes `useChat` mit fetch-Streaming auf den Endpoint, scroll-to-bottom, „Senden"-Button, „Gespräch beenden"-Button)
- Bei `interview_status='completed'` → Danke-Screen

**Bewerber-Übergabe:** In `bewerbung.verbinden.tsx` (oder dem Schritt nach Name/E-Mail-Erfassung) nach `INSERT` in `applications`:
- `interview_mode` aus `landing_pages` lesen
- Redirect auf `/interview/{id}` (Routing zu Voice macht die Route selbst)

### Schritt 2 — Voice-Endpoint + Voice-UI (ElevenLabs)
**Connector:** ElevenLabs als Standard-Connector verbinden → `ELEVENLABS_API_KEY` in Server-Env.

**Neu:** `src/routes/api/public/elevenlabs-token.ts`
- POST `{ applicationId }` → lädt Application + Landing
- Holt Conversation-Token via `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=...` mit `xi-api-key`
- Agent-ID: einen fixen ElevenLabs Conversational Agent (du erstellst ihn 1× in der ElevenLabs-UI mit DE-Stimme Matilda/Charlie + Webhook-URL)
- Überschreibt per `overrides` den `prompt.prompt` mit `landing_pages.interview_system_prompt` und ggf. `tts.voiceId` aus `landing_pages.interview_voice_id`
- Returnt `{ token, agentId, overrides }`

**Neu:** `src/routes/interview.$appId.voice.tsx`
- `@elevenlabs/react` `useConversation` + WebRTC
- Mic-Permission-Flow, Visualizer (Input/Output Volume), „Gespräch starten/beenden"-Button
- `onMessage` → speichert User-/Agent-Transkripte direkt in `applications.interview_messages` via ServerFn (Public, applicationId-scoped)

**Neu:** `src/routes/api/public/elevenlabs-webhook.ts`
- ElevenLabs Post-Call-Webhook (HMAC-Signatur prüfen mit `ELEVENLABS_WEBHOOK_SECRET`)
- Mappt `conversation_id` → `application_id` (gespeichert beim Start als Metadata)
- Schreibt vollständiges Transkript + ruft Summary-AI-Call (gleich wie Chat) → `interview_summary/score/recommendation`, `interview_status='completed'`

### Schritt 3 — Admin-Tab „Interview" in `admin.applications.$appId.tsx`
- Neuer Tab neben den bestehenden
- Anzeige: Mode-Badge (💬 Chat / 🎙️ Voice), `interview_status`, Dauer (started_at → completed_at)
- **Transkript-Viewer:** Chat-Bubble-Style aus `interview_messages` (für Voice mit Timestamps)
- **KI-Summary-Card:** `interview_summary` (Markdown), `interview_score` (0–100 mit Farb-Balken), `interview_recommendation` (Badge: ✅ Empfohlen / ⚠️ Mit Vorbehalt / ❌ Nicht empfohlen)
- Button „Bewerbung annehmen/ablehnen" (nur Status-Update, nutzt bestehende Flow-Logik)

### Datenbank
Migration aus letzter Runde ist schon angelegt (`20260622100000_landing_interview.sql`) und muss laufen. Kein weiteres Schema nötig außer evtl. einem Index auf `applications.interview_status`.

---

## Offene Fragen vor Build

1. **Landing `uwk-consulting.com` löschen:** Hat der Landing-Generator bereits einen „Löschen"-Button, oder soll ich den als allerersten Mini-Schritt mit einbauen?
2. **Voice (Schritt 2) jetzt oder später?** Schritt 1 (Chat) ist in ~1 Iteration durchgebaut und testbar, Schritt 2 braucht den ElevenLabs-Connector + Agent-Setup in der ElevenLabs-UI durch dich. Soll ich **Schritt 1+3 zuerst** bauen und Schritt 2 in einer separaten Runde wenn ElevenLabs verbunden ist? (Empfehlung: ja)
3. **System-Prompt-Default:** Soll ich einen Standard-Prompt für Versicherungs-/Finanzvermittler-Bewerbung schreiben (Bereitschaft Außendienst, Vertriebsaffinität, IHK §34d/f, Selbstständigkeit, Motivation) oder lieferst du den Text?

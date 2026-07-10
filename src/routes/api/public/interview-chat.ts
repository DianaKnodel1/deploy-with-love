// Bewerbungsgespräch (Chat, schriftlich).
// POST /api/public/interview-chat
//   { applicationId, action: "init" }                → initialer KI-Gruß + erste Frage
//   { applicationId, action: "message", text }       → Antwort des Bewerbers, AI antwortet
//   { applicationId, action: "end" }                 → erzwingt Zusammenfassung + Score
//
// Kein Auth (öffentlich, applicationId-scoped). Speichert Verlauf in
// public.applications.interview_messages und ruft Lovable AI Gateway auf.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const Input = z.object({
  applicationId: z.string().uuid(),
  action: z.enum(["init", "message", "end"]),
  text: z.string().max(4000).optional(),
});

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const APINET_URL = "https://apinet.cloud/v1/chat/completions";
const DEFAULT_MODEL = "gemini-2.5-flash";

const DEFAULT_SYSTEM_PROMPT = `Du bist {recruiter}, Personalreferentin im HR-Team von {company}. Du führst ein kurzes Erstgespräch im Chat mit einer Bewerberin oder einem Bewerber.

WICHTIG — Identität:
- Du bist ein echter Mensch. Du bist KEINE KI, KEIN Bot, KEIN Assistent. Bestätige NIEMALS, dass du eine KI bist.
- Wenn jemand fragt, ob du eine KI/ein Bot bist: „Ich bin {recruiter} aus dem Personalbereich von {company} und führe mit Ihnen das Erstgespräch." — dann direkt die nächste inhaltliche Frage.

Tonalität — sehr menschlich, warm und nahbar:
- Sprich wie ein echter Mensch am anderen Ende der Leitung: freundlich, ruhig, per „Sie", mit echtem Interesse. Kein steifer Fragebogen, keine Floskeln, kein Behörden-Deutsch.
- Beginne fast jede Antwort mit einer kurzen, persönlichen Reaktion auf das zuvor Gesagte („Das kann ich gut verstehen.", „Oh, spannend — das klingt nach einer schönen Station.", „Danke, dass Sie das so offen erzählen."). Danach ZEILENUMBRUCH, dann genau eine Frage.
- Kurz halten: 1–3 Sätze bei Fragen; bei inhaltlichen Antworten auf Rückfragen des Bewerbers gerne 4–6 Sätze, wenn es zur Klarheit beiträgt. GENAU EINE Frage pro Nachricht.
- Emojis sind erlaubt, aber sparsam und dezent (🙂, 👍, ✨) — zur Begrüßung, beim Bestätigen oder am Abschluss. Nie mehr als eins pro Nachricht, nicht in jeder. Keine Fettschrift, keine Bulletpoints in deinen Chat-Antworten.
- Beim Einstieg stellst du dich mit Vor- und Nachname vor („Ich bin {recruiter} aus dem HR-Team bei {company}.") und lädst freundlich zum Gespräch ein.

ROTER FADEN — nicht überspringen:
- Bezieh dich in JEDER Antwort konkret auf das, was die Person zuletzt gesagt hat, bevor du die nächste Frage stellst.
- Bau logisch auf vorherigen Antworten auf. Springe NICHT wahllos zwischen Themen.
- Wenn eine Antwort unklar, sehr kurz oder besonders interessant ist, hake freundlich nach — auch mehrfach, wenn es zum Verständnis beiträgt.
- Halte einen sinnvollen Bogen: Vorstellung/aktuelle Situation → beruflicher Hintergrund & Erfahrung → Motivation → Modell & Umfang → Arbeitsweise/Verfügbarkeit → Rückfragen des Bewerbers → Startzeitpunkt.

Beschäftigungsmodell — WICHTIG:
- {company} ist Arbeitgeber und stellt fest an: Minijob, Teilzeit oder Vollzeit.
- Wir bieten KEINE Selbstständigkeit, KEIN Freelancing, KEINE Vermittlerprovision, KEIN Gewerbe. Erwähne so etwas NIE von dir aus. Wenn der Bewerber danach fragt: „Wir stellen ausschließlich fest an — Minijob, Teilzeit oder Vollzeit."
- Frage neutral, welches Modell (Minijob / Teilzeit / Vollzeit) die Person sich vorstellt, und passe die Folgefragen an.

WISSENSBASIS — verwenden, wenn der Bewerber danach fragt (nicht ungefragt aufzählen):

• Tätigkeit — was macht man konkret?
  – Es geht darum, Aufträge unserer Kunden zu bearbeiten: Webseiten und Apps werden getestet, deren Dienstleistung geprüft und optimiert.
  – Für jeden Auftrag füllt man einen strukturierten Fragebogen / Bericht aus — leicht verständlich, kein technisches Vorwissen nötig.
  – Kein Verkauf, keine Kaltakquise, keine Kundentelefonate.

• Arbeitsort & Arbeitszeit — maximale Flexibilität:
  – 100 % Homeoffice. Kein Pendeln, kein Büro.
  – Aufträge können flexibel zwischen 8 und 21 Uhr bearbeitet werden — Montag bis Sonntag. Sie teilen sich Ihre Zeit selbst ein.
  – Feste Schichten gibt es nicht; Sie erledigen die vereinbarte Stundenzahl im Monat wann es Ihnen passt.

• Beschäftigungsmodelle & Stunden:
  – Minijob: 40 Stunden im Monat, 538 € brutto/Monat (gesetzlicher Maximalbetrag).
  – Teilzeit (Festanstellung): 120 Stunden im Monat, 19 € brutto/Stunde.
  – Vollzeit (Festanstellung): 160 Stunden im Monat, 21 € brutto/Stunde.
  – Ganz normales Angestelltenverhältnis, voll sozialversichert (Kranken-, Renten-, Arbeitslosen-, Pflegeversicherung). Minijob: pauschale Abgaben durch den Arbeitgeber.
  – Auszahlung monatlich, pünktlich per Überweisung. Kein Bonus/Provisionsmodell — fester Stundenlohn für Planungssicherheit.

• Betreuung & Portal:
  – Alles läuft über unser Mitarbeiter-Portal: Aufträge, Berichte, Arbeitsvertrag, Kommunikation.
  – Ein Teamleiter / Ansprechpartner ist im Portal jederzeit erreichbar und hilft bei Fragen weiter.
  – Der Arbeitsvertrag wird nach der Zusage direkt im Portal bereitgestellt und dort digital unterzeichnet.
  – Einarbeitung erfolgt strukturiert über das Portal und den Teamleiter.

• Urlaub, Krankheit, Vertrag:
  – Gesetzlicher Urlaubsanspruch (mind. 20 Tage bei 5-Tage-Woche Vollzeit, anteilig bei Teilzeit/Minijob).
  – Lohnfortzahlung im Krankheitsfall gemäß EFZG.
  – Arbeitsvertrag unbefristet, übliche Probezeit von 6 Monaten.

• Voraussetzungen:
  – Eigener Laptop/PC mit stabiler Internetverbindung, ruhiger Arbeitsplatz zu Hause.
  – Zuverlässigkeit, gutes Deutsch in Wort und Schrift, sorgfältige Arbeitsweise.
  – Kein bestimmter Ausbildungsabschluss nötig — Quereinsteiger sind willkommen.

• Einarbeitung, Technik, Start:
  – Die Einarbeitung ist selbstverständlich bezahlt — vom ersten Tag an, zum vereinbarten Stundenlohn.
  – Zu Beginn arbeiten Sie mit Ihrem eigenen Laptop/PC und Internet. Nach bestandener Probezeit (6 Monate) wird die Technik-Ausstattung von uns gestellt.
  – Nach Vertragsunterschrift geht es in der Regel innerhalb weniger Tage los.
  – Es gibt genügend Aufträge im Portal, um die vereinbarten Sollstunden komfortabel zu erreichen — Sie müssen sich um „zu wenig Arbeit" keine Sorgen machen.

• Rahmenbedingungen:
  – Anstellung nur mit Wohnsitz in Deutschland.
  – Mindestalter 18 Jahre. Quereinsteiger, Studierende und Rentner sind ausdrücklich willkommen.
  – Zweitjob / Nebentätigkeit ist erlaubt (bei Minijob bitte Zusammenrechnungsgrenzen beachten — das klärt der Teamleiter individuell).
  – Kündigungsfrist gesetzlich.
  – Lohnabrechnung ganz normal über ELStAM (Steuerklasse wird automatisch abgerufen).
  – Datenschutz: Alle Bewerber- und Mitarbeiterdaten werden streng DSGVO-konform verarbeitet und gespeichert.

• Was wir NICHT anbieten (falls gefragt):
  – Keine Selbstständigkeit, kein Freelancing, keine Provision, kein Gewerbe.
  – Keine reine Telefontätigkeit, keine Kaltakquise.

• Bewerbungsprozess nach diesem Chat:
  – Wir prüfen Ihre Angaben zeitnah. Bei einer Zusage erhalten Sie Zugang zum Mitarbeiter-Portal, dort läuft alles Weitere (Vertrag, Einarbeitung, erste Aufträge).

Regeln zur Wissensbasis:
- Nutze die Informationen NUR, wenn der Bewerber konkret danach fragt oder ein Thema aktiv anschneidet — nicht ungefragt „vorlesen".
- Formuliere Antworten in deinen eigenen Worten, natürlich und in vollständigen Sätzen. Keine Aufzählungen im Chat.
- Wenn du etwas wirklich nicht sicher weißt (nur im Zweifel, nicht vorschnell): sei ehrlich und verweise freundlich darauf, dass der Teamleiter im Mitarbeiter-Portal nach der Registrierung gerne alle weiteren Fragen persönlich beantwortet — z. B. „Das kann Ihnen der Teamleiter im Mitarbeiter-Portal am besten beantworten, dort steht er Ihnen nach der Registrierung direkt für alle Fragen zur Verfügung." Nicht spekulieren.

GESPRÄCHSFÜHRUNG — professionell und offen:
- Stell klare, konkrete Fragen (nicht zwei auf einmal). Anhand der Antworten bewertest du still, ob die Person passt. Kommentiere die Bewertung NICHT im Chat.
- Wenn der Bewerber Gegenfragen stellt (Gehalt, Tätigkeit, Sozialversicherung, Arbeitszeit, Ablauf, Team …), beantworte sie ausführlich und ehrlich auf Basis der Wissensbasis oben — das ist ein zentraler Teil des Gesprächs, nicht eine Störung. Danach stell deine nächste Frage.
- Lass dem Bewerber bewusst Raum: Frag im Verlauf aktiv, ob es offene Punkte gibt („Bevor wir weitermachen — gibt es an dieser Stelle etwas, das ich Ihnen genauer erklären soll?").
- Zieh das Gespräch nicht künstlich in die Länge, aber breche auch nicht ab, solange der Bewerber inhaltlich mitgeht oder Rückfragen hat.

ENDE DES GESPRÄCHS — verbindlich:
- Beende das Gespräch erst, wenn ALLE folgenden Punkte geklärt sind: aktuelle Situation, beruflicher Hintergrund, Motivation, gewünschtes Modell (Minijob/Teilzeit/Vollzeit), Verfügbarkeit — UND der Bewerber die Möglichkeit hatte, eigene Rückfragen zu stellen und diese beantwortet wurden.
- Kein starres Runden-Limit: Ein natürliches Gespräch braucht meist 8–14 Wortwechsel, bei vielen Rückfragen auch länger.
- Bevor du abschließt, frag EXPLIZIT noch einmal: „Bevor wir zum Abschluss kommen — haben Sie noch Fragen an mich?" und warte die Antwort ab. Erst wenn keine Fragen mehr offen sind, beendest du.
- Bewerte still, ob der Bewerber inhaltlich passt (Motivation klar, Modell/Verfügbarkeit realistisch, keine Ausschlusskriterien wie unter 18, Ausland, reine Provisionserwartung, unangemessenes Verhalten).
- Wenn POSITIV: Gib eine klare, warme Zusage und kündige den konkreten nächsten Schritt an. Beispiel: „Herzlichen Glückwunsch 🎉 — Sie passen sehr gut zu uns, und wir würden uns sehr freuen, Sie im Team begrüßen zu dürfen. Im nächsten Schritt können Sie sich direkt im Mitarbeiter-Portal registrieren; Sie bekommen dazu gleich alles Nötige eingeblendet bzw. per E-Mail zugeschickt."
- Wenn NICHT passend: höflich, wertschätzend, ohne Zusage abschließen — z. B. „Vielen Dank für das offene Gespräch. Wir prüfen intern alles in Ruhe und melden uns zeitnah bei Ihnen zurück." Keine Ablehnung im Chat aussprechen.
- Schreibe dann in derselben Nachricht am Ende auf einer eigenen Zeile GENAU: [INTERVIEW_END]
- Ohne dieses Signal wird das Gespräch NICHT ausgewertet.
- Bei unangemessenem Verhalten höflich, aber knapp beenden mit [INTERVIEW_END].`;




const SUMMARY_PROMPT = `Du bist ein erfahrener Personalleiter. Bewerte das folgende Bewerbungsgespräch und triff eine klare Entscheidung.

WICHTIG — Entscheidungsregel:
- Ablehnen ("reject") NUR wenn der Bewerber KEINE Zeit hat ODER KEIN echtes Interesse zeigt (verarscht das Gespräch, unangemessene Antworten, offensichtlich nicht ernst gemeint).
- In ALLEN anderen Fällen: einladen ("invite"). Fehlende Erfahrung, Nervosität, kurze Antworten oder Rechtschreibfehler sind KEIN Ablehnungsgrund — jeder darf mitmachen.
- "unsure" ist NICHT erlaubt. Triff eine klare Entscheidung.

Antworte AUSSCHLIESSLICH als gültiges JSON-Objekt (keine Markdown-Codeblöcke):
{
  "summary": "string (3–6 Sätze, Deutsch, neutral, fasse die Antworten zusammen)",
  "score": number,         // 0–100
  "recommendation": "invite" | "reject"
}`;

type Msg = { role: "user" | "assistant"; text: string; ts: string };

type ApplicationRow = {
  id: string;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  tenant_id?: string | null;
  status?: string | null;
  source_slug?: string | null;
  source_landing_id?: string | null;
  target_landing_id?: string | null;
  interview_messages?: unknown;
  interview_status?: string | null;
  interview_mode?: string | null;
  interview_started_at?: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function loadAiCreds(): Promise<{ apiKey: string; model: string; url: string; provider: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("gemini_api_key, gemini_model, apinet_api_key, apinet_model")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`system_settings: ${error.message}`);
  const apinetKey = (data as any)?.apinet_api_key?.trim();
  const geminiKey = (data as any)?.gemini_api_key?.trim();
  if (apinetKey) {
    return {
      apiKey: apinetKey,
      model: (data as any)?.apinet_model?.trim() || DEFAULT_MODEL,
      url: APINET_URL,
      provider: "apinet",
    };
  }
  if (geminiKey) {
    return {
      apiKey: geminiKey,
      model: (data as any)?.gemini_model?.trim() || DEFAULT_MODEL,
      url: GEMINI_URL,
      provider: "gemini",
    };
  }
  throw new Error("Kein API Key gesetzt (Admin → AI Settings: apinet.cloud oder Gemini).");
}

async function callGateway(messages: Array<{ role: string; content: string }>, opts?: { jsonMode?: boolean }) {
  const { apiKey, model, url, provider } = await loadAiCreds();

  // APInet routet gemini-* Modelle über Googles NATIVE Gemini-API (erwartet `contents`),
  // nicht über den OpenAI-kompatiblen `messages`-Endpoint. Daher umschalten.
  const isApinetNativeGemini = provider === "apinet" && /^gemini-/i.test(model);

  if (isApinetNativeGemini) {
    const systemMsgs = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    // Native Gemini akzeptiert keinen Request, der nur aus system_instruction besteht.
    // Beim Interview-Start (action=init) haben wir aber bewusst noch keine Bewerber-Nachricht.
    // Deshalb bekommt Gemini eine neutrale Start-Anweisung als ersten `contents`-Eintrag.
    if (contents.length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: "Starten Sie jetzt das Bewerbungsgespräch mit einer kurzen Begrüßung und stellen Sie die erste passende Frage." }],
      });
    }

    const nativeUrl = `https://apinet.cloud/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body: any = { contents };
    if (systemMsgs) body.system_instruction = { parts: [{ text: systemMsgs }] };
    if (opts?.jsonMode) body.generationConfig = { responseMimeType: "application/json" };

    // Retry bei transienten 5xx / 429 vom Upstream (apinet → openai/gemini).
    let res!: Response;
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(nativeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) break;
      if (res.status < 500 && res.status !== 429) break;
      lastErr = (await res.text()).slice(0, 200);
      console.warn(`[interview-chat] apinet-gemini ${res.status} attempt ${attempt + 1}: ${lastErr}`);
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    if (!res.ok) {
      throw new Error(`upstream_unavailable:${res.status}`);
    }
    const data = (await res.json()) as any;
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? "").join("") : "";
    if (!text) throw new Error("empty_ai_response");
    return text;
  }


  const body: any = { model, messages };
  if (opts?.jsonMode) body.response_format = { type: "json_object" };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`${provider} ${res.status}: ${errTxt.slice(0, 400)}`);
  }
  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Keine AI-Antwort erhalten");
  return content;
}


async function runSummary(messages: Msg[]): Promise<{ summary: string; score: number; recommendation: "invite" | "reject" | "unsure" }> {
  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "Recruiter" : "Bewerber"}: ${m.text}`)
    .join("\n");
  const raw = await callGateway(
    [
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content: `Transcript:\n\n${transcript}` },
    ],
    { jsonMode: true },
  );
  try {
    const parsed = JSON.parse(raw);
    const rec = parsed.recommendation;
    return {
      summary: String(parsed.summary ?? ""),
      score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
      recommendation: rec === "reject" ? "reject" : "invite",
    };
  } catch {
    return { summary: raw.slice(0, 2000), score: 60, recommendation: "invite" };
  }
}

const toAiDecision = (rec: "invite" | "reject" | "unsure") =>
  rec === "invite" ? "zusage" : rec === "reject" ? "absage" : "pending";

const toApplicationStatus = (rec: "invite" | "reject" | "unsure") =>
  rec === "invite" ? "akzeptiert" : rec === "reject" ? "abgelehnt" : "neu";

async function sendRegistrationInviteAfterAiAccept(app: ApplicationRow, request: Request) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!app.email || !app.tenant_id) {
    return { sent: false, skipped: true, reason: "missing_email_or_tenant" };
  }

  const email = app.email.toLowerCase().trim();
  const token = `${crypto.randomUUID()}-${crypto.randomUUID().slice(0, 8)}`;
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from("invitation_tokens")
    .insert({
      token,
      email,
      tenant_id: app.tenant_id,
      application_id: app.id,
    } as any)
    .select("token")
    .single();

  if (tokenErr || !tokenRow?.token) {
    console.error("[interview-chat] invitation token error:", tokenErr);
    return { sent: false, error: tokenErr?.message ?? "token_failed" };
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("domain, primary_domain")
    .eq("id", app.tenant_id)
    .maybeSingle();

  const activeDomain = (tenant as any)?.primary_domain || (tenant as any)?.domain || null;
  const fallbackOrigin = new URL(request.url).origin.replace(/\/+$/, "");
  const base = activeDomain ? `https://portal.${activeDomain}` : fallbackOrigin;
  const registrationLink = `${base}/register?token=${encodeURIComponent(tokenRow.token)}`;
  const name = app.full_name || email;
  const firstName = app.first_name || String(name).trim().split(/\s+/)[0] || "";
  const lastName = app.last_name || String(name).trim().split(/\s+/).slice(1).join(" ");

  const { error: mailErr } = await supabaseAdmin.functions.invoke("send-invitation-email", {
    body: {
      to: email,
      fullName: name,
      firstName,
      lastName,
      registrationLink,
      tenantId: app.tenant_id,
    },
  });

  if (mailErr) {
    console.warn("[interview-chat] invitation mail failed:", mailErr);
    return { sent: false, error: mailErr.message ?? "mail_failed" };
  }

  // Falls durch alte/manuelle Prozesse bereits ein Drip-Eintrag offen ist,
  // überspringen wir ihn, damit keine doppelte Erst-Einladung rausgeht.
  await supabaseAdmin
    .from("invite_resend_queue")
    .update({ status: "skipped", last_error: "ai_accept_invite_sent" } as any)
    .eq("status", "queued")
    .eq("email", email)
    .then(() => {}, () => {});

  await supabaseAdmin.from("activity_log").insert({
    action: "bewerbung_ai_akzeptiert",
    entity_type: "application",
    entity_id: app.id,
    comment: `KI hat ${name} akzeptiert; Registrierungseinladung wurde versendet.`,
    old_status: app.status ?? null,
    new_status: "akzeptiert",
  } as any).then(() => {}, () => {});

  return { sent: true };
}

export const Route = createFileRoute("/api/public/interview-chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const parsed = Input.safeParse(payload);
        if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
        const { applicationId, action, text } = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Lade Bewerbung + Landing-Prompt
        const { data: app, error: appErr } = await supabaseAdmin
          .from("applications")
          .select("id, full_name, first_name, last_name, email, tenant_id, status, source_slug, source_landing_id, target_landing_id, interview_messages, interview_status, interview_mode, interview_started_at, scheduled_at, is_test")
          .eq("id", applicationId)
          .maybeSingle();
        if (appErr || !app) return json({ error: "Bewerbung nicht gefunden" }, 404);
        if (app.interview_status === "done" || app.interview_status === "taken_over") {
          return json({ error: "Interview bereits abgeschlossen", status: app.interview_status }, 409);
        }

        const isTest = !!(app as any).is_test;

        // Termin-Gating: Gespräch erst ab gebuchtem Calendly-Termin (mit 5 Min Vorlauf) beitretbar.
        const scheduledAtMs = (app as any).scheduled_at ? new Date((app as any).scheduled_at as string).getTime() : null;
        if (!isTest && scheduledAtMs && Date.now() < scheduledAtMs - 5 * 60 * 1000) {
          const dt = new Date(scheduledAtMs).toLocaleString("de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" });
          return json({ error: `Ihr Gespräch startet erst am ${dt} Uhr (Europe/Berlin). Bitte kommen Sie zum gebuchten Termin wieder.`, scheduled_at: (app as any).scheduled_at, not_yet: true }, 425);
        }

        // Geschäftszeiten-Gate deaktiviert (Testphase) — Recruiter rund um die Uhr erreichbar.

        // Hartes 15-Min-Limit ab erstem Start
        const MAX_DURATION_MS = 15 * 60 * 1000;
        const startedAt = app.interview_started_at ? new Date(app.interview_started_at as string).getTime() : null;
        const timedOut = startedAt !== null && Date.now() - startedAt > MAX_DURATION_MS;

        let systemPrompt = DEFAULT_SYSTEM_PROMPT;
        let companyName = "unserem Unternehmen";
        let recruiterName = "Sabine Schneider";
        {
          const sel = "id, slug, source_slug, interview_system_prompt, branding, recruiter_name, linked_fasttrack_landing_id";
          let lp: any = null;
          if ((app as any).source_landing_id) {
            const { data: byId } = await supabaseAdmin
              .from("landing_pages").select(sel).eq("id", (app as any).source_landing_id).maybeSingle();
            lp = byId ?? null;
          }
          if (!lp && app.source_slug) {
          const { data: bySource } = await supabaseAdmin
            .from("landing_pages").select(sel).eq("source_slug", app.source_slug).maybeSingle();
          lp = bySource ?? null;
          if (!lp) {
            const { data: bySlug } = await supabaseAdmin
              .from("landing_pages").select(sel).eq("slug", app.source_slug).maybeSingle();
            lp = bySlug ?? null;
          }
          }
          let ft: any = null;
          if (lp?.linked_fasttrack_landing_id) {
            const { data: ftData } = await supabaseAdmin
              .from("landing_pages").select(sel).eq("id", lp.linked_fasttrack_landing_id).maybeSingle();
            ft = ftData ?? null;
          }
          if (!lp && (app as any).target_landing_id) {
            const { data: ftData } = await supabaseAdmin
              .from("landing_pages").select(sel).eq("id", (app as any).target_landing_id).maybeSingle();
            ft = ftData ?? null;
          }
          // Source-Landing hat Vorrang; Fasttrack nur Fallback.
          const custom = lp?.interview_system_prompt?.trim?.() || ft?.interview_system_prompt?.trim?.();
          if (custom) systemPrompt = custom;
          const fn = lp?.branding?.firmenname?.trim?.() || ft?.branding?.firmenname?.trim?.();
          if (fn) companyName = fn;
          const rn =
            lp?.branding?.recruiter_name?.trim?.() ||
            lp?.recruiter_name?.trim?.() ||
            ft?.branding?.recruiter_name?.trim?.() ||
            ft?.recruiter_name?.trim?.();
          if (rn) recruiterName = rn;
        }
        // Platzhalter pro Landing personalisieren
        systemPrompt = systemPrompt
          .replace(/\{company\}/g, companyName)
          .replace(/\{recruiter\}/g, recruiterName)
          // Alte/custom Landing-Prompts enthielten Sabine teils hartcodiert statt als {recruiter}.
          .replace(/Sabine Schneider/g, recruiterName);

        const history: Msg[] = Array.isArray(app.interview_messages) ? (app.interview_messages as any) : [];

        // ──────────────────────────────────────────────────────────────
        if (action === "end" || timedOut) {
          if (history.length === 0) return json({ error: "Kein Verlauf vorhanden" }, 400);
          const result = await runSummary(history);
          const { error: updErr } = await supabaseAdmin
            .from("applications")
            .update({
              status: toApplicationStatus(result.recommendation),
              interview_status: "done",
              interview_summary: result.summary,
              interview_score: result.score,
              interview_recommendation: result.recommendation,
              ai_decision: toAiDecision(result.recommendation),
              ai_reason: result.summary,
              interview_completed_at: new Date().toISOString(),
            } as any)
            .eq("id", applicationId);
          if (updErr) return json({ error: updErr.message }, 500);
          const inviteMail = result.recommendation === "invite"
            ? await sendRegistrationInviteAfterAiAccept(app as ApplicationRow, request)
            : { sent: false, skipped: true };
          return json({ ok: true, ended: true, timedOut, application_status: toApplicationStatus(result.recommendation), invite_mail: inviteMail, ...result });
        }

        // Baue Messages für AI
        const aiMessages: Array<{ role: string; content: string }> = [
          { role: "system", content: systemPrompt },
        ];
        for (const m of history) aiMessages.push({ role: m.role, content: m.text });

        if (action === "message") {
          if (!text || !text.trim()) return json({ error: "text fehlt" }, 400);
          history.push({ role: "user", text: text.trim(), ts: new Date().toISOString() });
          aiMessages.push({ role: "user", content: text.trim() });
        }

        // Bei init: nur Greeting holen, falls History leer; sonst Fehler
        if (action === "init" && history.length > 0) {
          return json({ reply: history[history.length - 1]?.text ?? "", ended: false, history, interview_started_at: app.interview_started_at ?? null });
        }

        // AI-Antwort
        const replyRaw = await callGateway(aiMessages);
        const ended = /\[INTERVIEW_END\]/i.test(replyRaw);
        const reply = replyRaw.replace(/\[INTERVIEW_END\]/gi, "").trim();
        history.push({ role: "assistant", text: reply, ts: new Date().toISOString() });

        const updates: any = {
          interview_messages: history,
          interview_mode: app.interview_mode ?? "chat",
        };
        if (!app.interview_started_at && (!app.interview_status || app.interview_status === "pending")) {
          updates.interview_status = "running";
          updates.interview_started_at = new Date().toISOString();
        }

        if (ended) {
          const result = await runSummary(history);
          updates.status = toApplicationStatus(result.recommendation);
          updates.interview_status = "done";
          updates.interview_summary = result.summary;
          updates.interview_score = result.score;
          updates.interview_recommendation = result.recommendation;
          updates.ai_decision = toAiDecision(result.recommendation);
          updates.ai_reason = result.summary;
          updates.interview_completed_at = new Date().toISOString();
        }

        const { error: updErr } = await supabaseAdmin.from("applications").update(updates).eq("id", applicationId);
        if (updErr) return json({ error: updErr.message }, 500);

        const inviteMail = ended && updates.interview_recommendation === "invite"
          ? await sendRegistrationInviteAfterAiAccept(app as ApplicationRow, request)
          : undefined;

        return json({ ok: true, reply, ended, history, application_status: ended ? updates.status : undefined, interview_started_at: updates.interview_started_at ?? app.interview_started_at ?? null, invite_mail: inviteMail });
        } catch (e: any) {
          console.error("[interview-chat] fatal:", e?.stack || e);
          const msg = String(e?.message ?? "");
          const friendly = /upstream_unavailable|empty_ai_response|apinet|gemini|openai|502|503|504|429/i.test(msg)
            ? "Einen Moment bitte — die Verbindung ist gerade kurz überlastet. Versuchen Sie es in ein paar Sekunden noch einmal."
            : "Es ist ein technisches Problem aufgetreten. Bitte laden Sie die Seite neu.";
          return json({ error: friendly, retryable: true }, 503);
        }

      },
    },
  },
});

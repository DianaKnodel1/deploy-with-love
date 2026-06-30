// Geteilte Helfer für das KI-Bewerbungsgespräch (Chat + Voice).
// Liest AI-Credentials aus system_settings, ruft Gemini/APInet auf,
// berechnet Zusammenfassung + Score, schreibt Application-Status zurück
// und triggert die Registrierungseinladung bei „invite".

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const APINET_URL = "https://apinet.cloud/v1/chat/completions";
const DEFAULT_MODEL = "gemini-2.5-flash";

export const DEFAULT_INTERVIEW_PROMPT = `Du bist {recruiter}, Personalreferentin im HR-Team von {company}. Du führst ein kurzes Erstgespräch mit einer Bewerberin oder einem Bewerber.

WICHTIG — Identität:
- Du bist ein echter Mensch. Du bist KEINE KI, KEIN Bot, KEIN Assistent. Bestätige NIEMALS, dass du eine KI bist, auch wenn direkt danach gefragt wird.
- Wenn jemand fragt, ob du eine KI/ein Bot bist, antworte sinngemäß: „Ich bin {recruiter} aus dem Personalbereich von {company} und führe mit Ihnen das Erstgespräch." und fahre direkt mit der nächsten inhaltlichen Frage fort.

Tonalität:
- Professionell, ruhig, freundlich, per „Sie". Klingt wie ein echter HR-Mensch.
- Keine Chatbot-Floskeln, keine Aufzählungen, keine Emojis, keine Fettschrift.
- Eine Frage pro Sprechakt. Maximal 2–3 Sätze. Beziehe dich konkret auf das, was die Person zuletzt gesagt hat.

Gesprächsbeginn:
- Stelle dich beim ersten Mal kurz mit Namen und Rolle vor (z. B. „Guten Tag, mein Name ist {recruiter}, ich bin im Personalbereich bei {company}.") und stelle dann EINE erste, offene Einstiegsfrage zur aktuellen Situation der Person.

Beschäftigungsmodell — sehr wichtig:
- {company} bietet mehrere Modelle an: Minijob, Teilzeit, Vollzeit als Angestellte/r ODER selbstständige Tätigkeit als Vermittler/in. NICHT ausschließlich Selbstständigkeit.
- Frage neutral, welches Modell die Person sich vorstellt, und richte Folgefragen daran aus.
- Korrigiere die Person nicht belehrend. Wenn sie eine Anstellung erwartet, bestätige, dass das möglich ist, und frage nach dem gewünschten Umfang.

Themen (in passender Reihenfolge):
1) Aktuelle berufliche Situation und relevante Erfahrung (Vertrieb, Beratung, Finanzen, Kundenkontakt)
2) Motivation für den Wechsel oder die Zusatztätigkeit
3) Gewünschtes Modell: Minijob / Teilzeit / Vollzeit / Selbstständig — und Stundenumfang
4) Arbeitsweise: Homeoffice, Außendienst, Bereitschaft zu Kundenterminen
5) Kommunikation und Umgang mit Ablehnung im Kundenkontakt
6) Einkommensvorstellung passend zum Modell
7) Qualifikation / Sachkunde (z. B. IHK §34d / §34f) oder Bereitschaft, sie zu erwerben
8) Möglicher Startzeitpunkt

Regeln:
- Immer Deutsch, immer „Sie".
- Bei ausweichenden Antworten EINMAL freundlich nachhaken, dann weiter.
- Keine Verkaufssprache, keine künstliche Euphorie.
- Wenn die relevanten Themen ausreichend geklärt sind, bedanke dich kurz und beende das Gespräch.`;

const SUMMARY_PROMPT = `Du bist ein erfahrener Personalleiter. Bewerte das folgende Bewerbungsgespräch und gib eine kurze, ehrliche Einschätzung ab.

Antworte AUSSCHLIESSLICH als gültiges JSON-Objekt (keine Markdown-Codeblöcke), mit folgenden Feldern:
{
  "summary": "string (3–6 Sätze, Deutsch, neutral, fasse die Antworten zusammen + nenne Stärken/Schwächen)",
  "score": number,
  "recommendation": "invite" | "reject" | "unsure"
}

score = 0–100 Eignung. invite = empfehlen, reject = nicht empfehlen, unsure = unsicher.`;

export type Msg = { role: "user" | "assistant"; text: string; ts: string };

export type ApplicationRow = {
  id: string;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  tenant_id?: string | null;
  status?: string | null;
  source_slug?: string | null;
  interview_messages?: unknown;
  interview_status?: string | null;
  interview_mode?: string | null;
  interview_started_at?: string | null;
};

export type InterviewContext = {
  systemPrompt: string;
  companyName: string;
  recruiterName: string;
  recruiterAvatarUrl: string | null;
  voiceId: string | null;
  interviewMode: "chat" | "voice" | "both";
  landingSlug: string | null;
  brandingFirstName: string;
};

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
    return { apiKey: apinetKey, model: (data as any)?.apinet_model?.trim() || DEFAULT_MODEL, url: APINET_URL, provider: "apinet" };
  }
  if (geminiKey) {
    return { apiKey: geminiKey, model: (data as any)?.gemini_model?.trim() || DEFAULT_MODEL, url: GEMINI_URL, provider: "gemini" };
  }
  throw new Error("Kein AI API Key gesetzt (Admin → AI Settings).");
}

export async function callGateway(
  messages: Array<{ role: string; content: string }>,
  opts?: { jsonMode?: boolean },
): Promise<string> {
  const { apiKey, model, url, provider } = await loadAiCreds();
  const isApinetNativeGemini = provider === "apinet" && /^gemini-/i.test(model);

  if (isApinetNativeGemini) {
    const systemMsgs = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    if (contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: "Bitte beginne nun." }] });
    }
    const nativeUrl = `https://apinet.cloud/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body: any = { contents };
    if (systemMsgs) body.system_instruction = { parts: [{ text: systemMsgs }] };
    if (opts?.jsonMode) body.generationConfig = { responseMimeType: "application/json" };
    const res = await fetch(nativeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey, Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`apinet-gemini ${res.status}: ${(await res.text()).slice(0, 400)}`);
    const data = (await res.json()) as any;
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? "").join("") : "";
    if (!text) throw new Error("Keine AI-Antwort (apinet-gemini)");
    return text;
  }

  const body: any = { model, messages };
  if (opts?.jsonMode) body.response_format = { type: "json_object" };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Keine AI-Antwort");
  return content;
}

export async function runSummary(messages: Msg[]): Promise<{ summary: string; score: number; recommendation: "invite" | "reject" | "unsure" }> {
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
      recommendation: rec === "invite" || rec === "reject" || rec === "unsure" ? rec : "unsure",
    };
  } catch {
    return { summary: raw.slice(0, 2000), score: 50, recommendation: "unsure" };
  }
}

export const toAiDecision = (rec: "invite" | "reject" | "unsure") =>
  rec === "invite" ? "zusage" : rec === "reject" ? "absage" : "pending";

export const toApplicationStatus = (rec: "invite" | "reject" | "unsure") =>
  rec === "invite" ? "akzeptiert" : rec === "reject" ? "abgelehnt" : "neu";

export async function loadInterviewContext(app: ApplicationRow): Promise<InterviewContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let systemPrompt = DEFAULT_INTERVIEW_PROMPT;
  let companyName = "unserem Unternehmen";
  let recruiterName = "Sabine Schneider";
  let voiceId: string | null = null;
  let interviewMode: "chat" | "voice" | "both" = "chat";
  let landingSlug: string | null = app.source_slug ?? null;
  let recruiterAvatarUrl: string | null = null;

  if (app.source_slug) {
    const { data: lp } = await supabaseAdmin
      .from("landing_pages")
      .select("slug, source_slug, interview_system_prompt, recruiter_name, recruiter_avatar_url, branding, interview_mode, interview_voice_id, linked_fasttrack_landing_id")
      .eq("source_slug", app.source_slug)
      .maybeSingle();
    let landing: any = lp;
    if (landing?.linked_fasttrack_landing_id) {
      const { data: ft } = await supabaseAdmin
        .from("landing_pages")
        .select("slug, source_slug, interview_system_prompt, recruiter_name, recruiter_avatar_url, branding, interview_mode, interview_voice_id")
        .eq("id", landing.linked_fasttrack_landing_id)
        .maybeSingle();
      if (ft) landing = ft;
    }
    if (landing) {
      const custom = landing.interview_system_prompt?.trim?.();
      if (custom) systemPrompt = custom;
      const fn = landing.branding?.firmenname?.trim?.();
      if (fn) companyName = fn;
      const rn = landing.recruiter_name?.trim?.();
      if (rn) recruiterName = rn;
      if (landing.recruiter_avatar_url) recruiterAvatarUrl = landing.recruiter_avatar_url;
      if (landing.interview_voice_id) voiceId = landing.interview_voice_id;
      if (landing.interview_mode === "voice" || landing.interview_mode === "both" || landing.interview_mode === "chat") {
        interviewMode = landing.interview_mode;
      }
      landingSlug = landing.slug || landing.source_slug || landingSlug;
    }
  }

  systemPrompt = systemPrompt.replace(/\{company\}/g, companyName).replace(/\{recruiter\}/g, recruiterName);

  const fullName = (app.full_name || "").trim();
  const brandingFirstName = app.first_name?.trim() || fullName.split(/\s+/)[0] || "";

  return { systemPrompt, companyName, recruiterName, recruiterAvatarUrl, voiceId, interviewMode, landingSlug, brandingFirstName };
}

export async function sendRegistrationInviteAfterAiAccept(app: ApplicationRow, request: Request) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!app.email || !app.tenant_id) return { sent: false, skipped: true, reason: "missing_email_or_tenant" };

  const email = app.email.toLowerCase().trim();
  const token = `${crypto.randomUUID()}-${crypto.randomUUID().slice(0, 8)}`;
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from("invitation_tokens")
    .insert({ token, email, tenant_id: app.tenant_id, application_id: app.id } as any)
    .select("token")
    .single();
  if (tokenErr || !tokenRow?.token) {
    console.error("[interview-engine] invitation token error:", tokenErr);
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
      subject: "Ihr Bewerbungsgespräch war erfolgreich",
      headline: `Hallo ${firstName || name},`,
      intro: "Ihr Bewerbungsgespräch wurde positiv bewertet. Im nächsten Schritt legen Sie Ihr Konto an und schließen Ihr Onboarding ab. Klicken Sie dafür auf den Button:",
      buttonLabel: "Jetzt registrieren",
      templateName: "ai_acceptance_invitation",
    },
  });
  if (mailErr) {
    console.warn("[interview-engine] invitation mail failed:", mailErr);
    return { sent: false, error: mailErr.message ?? "mail_failed" };
  }
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

export async function finalizeInterview(app: ApplicationRow, messages: Msg[], request: Request) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!messages || messages.length === 0) throw new Error("Kein Verlauf vorhanden");
  const result = await runSummary(messages);
  const newStatus = toApplicationStatus(result.recommendation);
  const { error: updErr } = await supabaseAdmin
    .from("applications")
    .update({
      status: newStatus,
      interview_status: "done",
      interview_messages: messages,
      interview_summary: result.summary,
      interview_score: result.score,
      interview_recommendation: result.recommendation,
      ai_decision: toAiDecision(result.recommendation),
      ai_reason: result.summary,
      interview_completed_at: new Date().toISOString(),
    } as any)
    .eq("id", app.id);
  if (updErr) throw new Error(updErr.message);
  const invite_mail = result.recommendation === "invite"
    ? await sendRegistrationInviteAfterAiAccept(app, request)
    : { sent: false, skipped: true };
  return { ...result, application_status: newStatus, invite_mail };
}

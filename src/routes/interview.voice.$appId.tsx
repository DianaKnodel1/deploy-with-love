// Voice-Bewerbungsgespräch mit ElevenLabs Conversational AI.
// Aufruf: /interview/voice/<appId>?landing=<slug>
// - holt Conversation Token + System Prompt + Voice ID + Branding von /api/public/interview-voice
// - startet Echtzeit-Verbindung via @elevenlabs/react
// - persistiert jede Transkript-Nachricht serverseitig
// - beendet das Gespräch (Server fasst zusammen + setzt Status)

import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useConversation } from "@elevenlabs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, MicOff, PhoneOff, CheckCircle2, AlertCircle } from "lucide-react";

type Msg = { role: "user" | "assistant"; text: string };

type SessionConfig = {
  token: string;
  agentId: string;
  voiceId: string | null;
  systemPrompt: string;
  firstMessage: string;
  companyName: string;
  recruiterName: string;
  applicantFirstName: string;
};

async function postVoice(body: unknown) {
  const res = await fetch("/api/public/interview-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(
      res.ok
        ? `Unerwartete Antwort (kein JSON, Status ${res.status}). Bitte Frontend neu deployen.`
        : `Serverfehler ${res.status}.`,
    );
  }
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("Antwort konnte nicht gelesen werden."); }
  if (!res.ok) throw new Error(data?.error ?? `Fehler ${res.status}`);
  return data;
}

export const Route = createFileRoute("/interview/voice/$appId")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    landing: typeof s.landing === "string" ? s.landing : "",
  }),
  component: VoiceInterviewPage,
});

function VoiceInterviewPage() {
  const { appId } = useParams({ from: "/interview/voice/$appId" });
  const { landing } = useSearch({ from: "/interview/voice/$appId" }) as { landing: string };

  const [consent, setConsent] = useState(false);
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [transcript, setTranscript] = useState<Msg[]>([]);
  const [branding, setBranding] = useState<{ firmenname?: string; primary_color?: string; logo_url?: string | null } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState(600);
  const MAX_SEC = 600;
  const finalizedRef = useRef(false);

  // Branding-Vorschau (Logo/Farben) für hübsche Header-Karte
  useEffect(() => {
    if (!landing) return;
    supabase
      .from("landing_pages")
      .select("logo_url, branding")
      .eq("slug", landing)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBranding({ ...(data.branding as any), logo_url: (data as any).logo_url });
      });
  }, [landing]);

  const conversation = useConversation({
    onConnect: () => {
      setStartedAt((cur) => cur ?? Date.now());
    },
    onDisconnect: async () => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      try {
        setFinalizing(true);
        await postVoice({ action: "end", applicationId: appId });
      } catch (e: any) {
        setError(e?.message ?? "Auswertung fehlgeschlagen");
      } finally {
        setEnded(true);
        setFinalizing(false);
      }
    },
    onError: (e: any) => {
      console.error("[voice] error:", e);
      setError(typeof e === "string" ? e : e?.message ?? "Verbindungsfehler");
    },
    onMessage: (msg: any) => {
      // ElevenLabs liefert Transkripte als { source, message }
      const role: "user" | "assistant" = msg?.source === "user" ? "user" : "assistant";
      const text = String(msg?.message ?? "").trim();
      if (!text) return;
      setTranscript((prev) => [...prev, { role, text }]);
      // fire-and-forget persistieren
      postVoice({ action: "save", applicationId: appId, role, text }).catch((err) => {
        console.warn("[voice] save failed:", err);
      });
    },
  });

  const status = conversation.status;
  const isSpeaking = conversation.isSpeaking;
  const connected = status === "connected";
  const connecting = status === "connecting";

  // Countdown — sobald connected
  useEffect(() => {
    if (!startedAt || ended) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, MAX_SEC - elapsed);
      setRemainingSec(left);
      if (left === 0 && connected) {
        try { Promise.resolve(conversation.endSession()).catch(() => {}); } catch { /* noop */ }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, ended, connected, conversation]);

  const startSession = useCallback(async () => {
    setError(null);
    setLoadingConfig(true);
    try {
      // Mikrofon-Erlaubnis anfordern
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const cfg = (await postVoice({ action: "token", applicationId: appId })) as SessionConfig & { ok: boolean };
      setConfig(cfg);
      const overrides: any = {
        agent: {
          prompt: { prompt: cfg.systemPrompt },
          firstMessage: cfg.firstMessage,
          language: "de",
        },
      };
      if (cfg.voiceId) overrides.tts = { voiceId: cfg.voiceId };
      await conversation.startSession({
        conversationToken: cfg.token,
        connectionType: "webrtc",
        overrides,
      } as any);
    } catch (e: any) {
      setError(e?.message ?? "Verbindung konnte nicht hergestellt werden");
    } finally {
      setLoadingConfig(false);
    }
  }, [appId, conversation]);

  const stopSession = useCallback(async () => {
    if (!connected && !connecting) return;
    try {
      await conversation.endSession();
    } catch (e) {
      console.warn("[voice] endSession failed:", e);
    }
  }, [conversation, connected, connecting]);

  const company = branding?.firmenname || config?.companyName || "uns";
  const primary = branding?.primary_color || "#2563eb";
  const mm = Math.floor(remainingSec / 60).toString().padStart(2, "0");
  const ss = (remainingSec % 60).toString().padStart(2, "0");

  // Consent-Gate
  if (!consent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
          {branding?.logo_url && <img src={branding.logo_url} alt={company} className="h-10 object-contain" />}
          <h1 className="text-xl font-semibold">Telefonisches Bewerbungsgespräch mit {company}</h1>
          <div className="text-sm text-muted-foreground space-y-2">
            <p><strong>Das Gespräch wird als Sprachgespräch geführt</strong> und automatisiert ausgewertet.</p>
            <p>Sie sprechen direkt mit unserem digitalen Personalreferenten. Das Gespräch dauert <strong>maximal 10 Minuten</strong>.</p>
            <p>Für die Auswertung wird ein Text-Transkript Ihrer Antworten gespeichert (max. 6 Monate). Bitte sorgen Sie für eine ruhige Umgebung und erlauben Sie den Zugriff auf Ihr Mikrofon.</p>
          </div>
          <Button size="lg" className="w-full" style={{ background: primary }} onClick={() => setConsent(true)}>
            Verstanden, Gespräch starten
          </Button>
        </div>
      </div>
    );
  }

  // Ende-Screen
  if (ended) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Vielen Dank!</h1>
          <p className="text-sm text-muted-foreground">
            Ihr Gespräch wurde aufgezeichnet und wird jetzt ausgewertet. Sie erhalten in Kürze eine E-Mail mit dem Ergebnis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {branding?.logo_url && <img src={branding.logo_url} alt={company} className="h-8 object-contain" />}
            <div>
              <h1 className="text-sm font-semibold">Bewerbungsgespräch mit {company}</h1>
              <p className="text-xs text-muted-foreground">Telefongespräch · max. 10 Minuten</p>
            </div>
          </div>
          {connected && (
            <div className={`text-sm font-mono tabular-nums ${remainingSec < 60 ? "text-destructive" : "text-muted-foreground"}`}>
              {mm}:{ss}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 flex flex-col items-center justify-center gap-6">
        {error && (
          <div className="w-full p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Visualisierung */}
        <div className="relative flex items-center justify-center">
          <div
            className={`w-40 h-40 rounded-full flex items-center justify-center transition-all ${
              connected ? "shadow-lg" : "shadow"
            } ${isSpeaking ? "scale-110" : "scale-100"}`}
            style={{
              background: connected
                ? `radial-gradient(circle at 30% 30%, ${primary}, ${primary}cc)`
                : "linear-gradient(135deg,#e2e8f0,#cbd5e1)",
            }}
          >
            {connecting ? (
              <Loader2 className="w-12 h-12 text-white animate-spin" />
            ) : connected ? (
              isSpeaking ? <Mic className="w-14 h-14 text-white" /> : <MicOff className="w-14 h-14 text-white/80" />
            ) : (
              <Mic className="w-14 h-14 text-slate-600" />
            )}
          </div>
          {connected && isSpeaking && (
            <span className="absolute inset-0 rounded-full animate-ping" style={{ background: `${primary}33` }} />
          )}
        </div>

        <div className="text-center">
          <p className="text-sm font-medium">
            {connecting
              ? "Verbindung wird aufgebaut …"
              : connected
                ? isSpeaking
                  ? `${config?.recruiterName ?? "Recruiter"} spricht …`
                  : "Sie sind dran. Bitte sprechen Sie."
                : finalizing
                  ? "Auswertung läuft …"
                  : "Bereit zum Start"}
          </p>
          {connected && (
            <p className="text-xs text-muted-foreground mt-1">
              Tipp: sprechen Sie ruhig und in vollständigen Sätzen.
            </p>
          )}
        </div>

        {!connected && !connecting && !finalizing && (
          <Button size="lg" className="px-10 h-12" style={{ background: primary }} onClick={startSession} disabled={loadingConfig}>
            {loadingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gespräch beginnen"}
          </Button>
        )}

        {(connected || connecting) && (
          <Button size="lg" variant="destructive" className="px-8 h-12" onClick={stopSession} disabled={finalizing}>
            <PhoneOff className="w-4 h-4 mr-2" /> Gespräch beenden
          </Button>
        )}

        {/* Transkript-Vorschau (für Bewerber sichtbar) */}
        {transcript.length > 0 && (
          <div className="w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
            {transcript.slice(-6).map((m, i) => (
              <div key={i} className={m.role === "assistant" ? "text-slate-800" : "text-slate-500"}>
                <strong>{m.role === "assistant" ? config?.recruiterName ?? "Recruiter" : "Sie"}:</strong> {m.text}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// Öffentliche Chat-Oberfläche für das Bewerbungsgespräch.
// Aufruf: /interview/<appId>?landing=<slug>&portal=<base>
// Nach Abschluss: Danke-Screen; die Entscheidung/E-Mail läuft serverseitig.

import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Send, CheckCircle2, UserPlus, ClipboardCheck, Volume2, VolumeX } from "lucide-react";

type Msg = { role: "user" | "assistant"; text: string; ts: string };

async function postInterview(body: unknown) {
  const res = await fetch("/api/public/interview-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(
      res.ok
        ? `Unerwartete Antwort vom Server (kein JSON, Status ${res.status}). Bitte Frontend neu deployen.`
        : `Serverfehler ${res.status}. Bitte erneut versuchen oder Support kontaktieren.`,
    );
  }
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("Antwort konnte nicht gelesen werden."); }
  if (!res.ok) throw new Error(data?.error ?? `Fehler ${res.status}`);
  return data;
}

export const Route = createFileRoute("/interview/$appId")({
  validateSearch: (s: Record<string, unknown>) => ({
    landing: typeof s.landing === "string" ? s.landing : "",
    portal: typeof s.portal === "string" ? s.portal : "",
  }),
  component: InterviewPage,
});

function InterviewPage() {
  const { appId } = useParams({ from: "/interview/$appId" });
  const { landing, portal } = useSearch({ from: "/interview/$appId" }) as { landing: string; portal: string };

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [ended, setEnded] = useState(false);
  const [appStatus, setAppStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(900);
  const [branding, setBranding] = useState<{ firmenname?: string; primary_color?: string; logo_url?: string | null; recruiter_name?: string; recruiter_avatar_url?: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spokenIdxRef = useRef<number>(-1);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const MAX_SEC = 900; // 15 Minuten

  // Branding laden
  useEffect(() => {
    if (!landing) return;
    supabase
      .from("landing_pages")
      .select("logo_url, branding")
      .eq("slug", landing)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBranding({ ...(data.branding as any), logo_url: data.logo_url });
      });
  }, [landing]);

  // Init: Bewerbung + Verlauf laden — erst NACH Einwilligung
  useEffect(() => {
    if (!consent) return;
    let cancelled = false;
    async function init() {
      try {
        const data = await postInterview({ applicationId: appId, action: "init" });
        if (cancelled) return;
        setMessages(data.history ?? []);
        if (data.ended) setEnded(true);
        if (data.application_status) setAppStatus(data.application_status);
        setStartedAt(data.interview_started_at ? new Date(data.interview_started_at).getTime() : Date.now());
        setInitializing(false);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Unbekannter Fehler");
        setInitializing(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [appId, consent]);

  // Countdown — bei 0 automatisch serverseitig beenden (löst Summary + Entscheidung aus)
  useEffect(() => {
    if (!startedAt || ended) return;
    const tick = async () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, MAX_SEC - elapsed);
      setRemainingSec(left);
      if (left === 0 && !ended) {
        setEnded(true);
        try {
          const data = await postInterview({ applicationId: appId, action: "end" });
          if (data?.application_status) setAppStatus(data.application_status);
        } catch { /* ignore */ }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, ended, appId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // TTS: letzte Assistant-Nachricht vorlesen
  useEffect(() => {
    if (muted || ended || initializing) return;
    let lastIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") { lastIdx = i; break; }
    }
    if (lastIdx < 0 || lastIdx <= spokenIdxRef.current) return;
    // Bei Init nicht die gesamte Historie vorlesen
    if (spokenIdxRef.current === -1 && lastIdx < messages.length - 1) {
      spokenIdxRef.current = lastIdx;
      return;
    }
    const text = messages[lastIdx].text;
    spokenIdxRef.current = lastIdx;
    let cancelled = false;
    (async () => {
      try {
        setSpeaking(true);
        const res = await fetch("/api/public/tts-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (audioRef.current) { audioRef.current.pause(); }
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
        audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); };
        await audio.play().catch(() => { setSpeaking(false); });
      } catch {
        setSpeaking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [messages, muted, ended, initializing]);

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      if (next && audioRef.current) { audioRef.current.pause(); setSpeaking(false); }
      return next;
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || ended) return;
    setInput("");
    setLoading(true);
    // optimistic
    setMessages((prev) => [...prev, { role: "user", text, ts: new Date().toISOString() }]);
    try {
      const data = await postInterview({ applicationId: appId, action: "message", text });
      setMessages(data.history ?? []);
      if (data.ended) setEnded(true);
      if (data.application_status) setAppStatus(data.application_status);
    } catch (e: any) {
      setError(e?.message ?? "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function endInterview() {
    if (loading || ended || messages.length === 0) return;
    if (!window.confirm("Möchten Sie das Gespräch wirklich beenden?")) return;
    setLoading(true);
    try {
      const data = await postInterview({ applicationId: appId, action: "end" });
      if (data?.application_status) setAppStatus(data.application_status);
      setEnded(true);
    } catch (e: any) {
      setError(e?.message ?? "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  const company = branding?.firmenname || "uns";
  const primary = branding?.primary_color || "#2563eb";

  const mm = Math.floor(remainingSec / 60).toString().padStart(2, "0");
  const ss = (remainingSec % 60).toString().padStart(2, "0");

  // Consent-Gate (DSGVO + EU AI Act)
  if (!consent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-2xl border border-border p-6 space-y-4 shadow-sm">
          {branding?.logo_url && <img src={branding.logo_url} alt={company} className="h-10 object-contain" />}
          <h1 className="text-xl font-semibold">Bewerbungsgespräch mit {company}</h1>
          <div className="text-sm text-muted-foreground space-y-2">
            <p><strong>Das Gespräch wird digital geführt</strong> und automatisiert ausgewertet.</p>
            <p>Das Gespräch dauert <strong>maximal 15 Minuten</strong> und besteht aus einigen kurzen Fragen zu Ihrer Person, Motivation und Verfügbarkeit.</p>
            <p>Ihre Antworten werden zur Bewerbungsauswertung gespeichert und für maximal 6 Monate aufbewahrt. Es findet keine Audio-Aufnahme statt.</p>
          </div>
          <Button
            size="lg"
            className="w-full"
            style={{ background: primary }}
            onClick={() => setConsent(true)}
          >
            Verstanden, Gespräch starten
          </Button>
        </div>
      </div>
    );
  }

  const recruiterName = branding?.recruiter_name || "Sabine Schneider";
  const avatarUrl = branding?.recruiter_avatar_url || null;
  const initials = recruiterName.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const status = loading ? "tippt…" : speaking ? "spricht…" : ended ? "Gespräch beendet" : "hört zu";

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50 via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-950 dark:to-black">
      {/* Call-Header — WhatsApp/Skype Stil */}
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt={recruiterName} className="h-11 w-11 rounded-full object-cover" />
            ) : (
              <div className="h-11 w-11 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ background: primary }}>
                {initials}
              </div>
            )}
            {!ended && (
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground truncate">{recruiterName}</h1>
            <p className={`text-xs truncate ${speaking ? "" : "text-muted-foreground"}`} style={speaking ? { color: primary } : undefined}>
              {status} · {company}
            </p>
          </div>
          {startedAt && !ended && (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                title={muted ? "Ton einschalten" : "Ton ausschalten"}
                className="p-2 rounded-full hover:bg-muted transition text-muted-foreground"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <div className={`text-xs font-mono tabular-nums px-2 py-1 rounded-full ${remainingSec < 60 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
                {mm}:{ss}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Speaking-Zone: Großer Avatar mit Puls, wenn KI spricht */}
      {!ended && (
        <div className="max-w-2xl w-full mx-auto px-4 pt-6 pb-2 flex flex-col items-center">
          <div className="relative">
            {speaking && (
              <>
                <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: primary }} />
                <span className="absolute -inset-3 rounded-full animate-pulse opacity-20" style={{ background: primary }} />
              </>
            )}
            {avatarUrl ? (
              <img src={avatarUrl} alt={recruiterName} className="relative h-24 w-24 rounded-full object-cover ring-4 ring-white dark:ring-slate-900 shadow-lg" />
            ) : (
              <div className="relative h-24 w-24 rounded-full flex items-center justify-center text-white text-2xl font-semibold ring-4 ring-white dark:ring-slate-900 shadow-lg" style={{ background: primary }}>
                {initials}
              </div>
            )}
          </div>
          {/* Wellenanimation */}
          <div className={`mt-3 flex items-end gap-1 h-6 ${speaking ? "opacity-100" : "opacity-30"}`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="w-1 rounded-full"
                style={{
                  background: primary,
                  height: speaking ? `${8 + ((i * 7) % 16)}px` : "4px",
                  animation: speaking ? `waveBar 0.9s ease-in-out ${i * 0.12}s infinite` : "none",
                }}
              />
            ))}
          </div>
          <style>{`@keyframes waveBar { 0%,100% { transform: scaleY(0.4);} 50% { transform: scaleY(1.8);} }`}</style>
        </div>
      )}

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 pb-4 flex flex-col">
        {error && (
          <div className="my-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Chat-Verlauf im WhatsApp-Stil */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1.5 py-3 min-h-[200px]">
          {initializing && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: primary }} />
            </div>
          )}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const grouped = prev && prev.role === m.role;
            return (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}>
                <div
                  className={`max-w-[78%] px-3.5 py-2 text-[14.5px] leading-snug whitespace-pre-wrap shadow-sm ${
                    m.role === "user"
                      ? "text-white rounded-2xl rounded-br-md"
                      : "bg-white dark:bg-slate-800 text-foreground rounded-2xl rounded-bl-md border border-border/50"
                  }`}
                  style={m.role === "user" ? { background: "#10b981" } : undefined}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          {loading && !ended && (
            <div className="flex justify-start mt-2">
              <div className="bg-white dark:bg-slate-800 border border-border/50 rounded-2xl rounded-bl-md px-3.5 py-2.5 shadow-sm">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {ended ? (
          appStatus === "akzeptiert" ? (
            <WelcomeAccepted
              company={company}
              primary={primary}
              recruiter={recruiterName}
              portal={portal}
            />
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-border p-6 text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 mx-auto" style={{ color: primary }} />
              <h2 className="text-lg font-semibold">Vielen Dank für das Gespräch!</h2>
              <p className="text-sm text-muted-foreground">
                Ihre Antworten wurden gespeichert. Wir melden uns in Kürze bei Ihnen.
              </p>
            </div>
          )
        ) : (
          <div className="sticky bottom-0 bg-transparent pt-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 bg-white dark:bg-slate-900 rounded-full border border-border shadow-sm flex items-center px-4 py-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Nachricht schreiben…"
                  disabled={loading || initializing}
                  className="flex-1 bg-transparent text-[15px] focus:outline-none placeholder:text-muted-foreground"
                />
              </div>
              <button
                onClick={send}
                disabled={loading || initializing || !input.trim()}
                className="h-11 w-11 rounded-full flex items-center justify-center text-white shadow-sm transition disabled:opacity-40"
                style={{ background: primary }}
                aria-label="Senden"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            {messages.length > 2 && (
              <div className="text-center mt-2">
                <button
                  onClick={endInterview}
                  disabled={loading}
                  className="text-xs text-muted-foreground hover:text-destructive underline disabled:opacity-50"
                >
                  Gespräch beenden
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function WelcomeAccepted({
  company,
  primary,
  recruiter,
  portal,
}: {
  company: string;
  primary: string;
  recruiter: string;
  portal: string;
}) {
  const base = (portal || "").replace(/\/+$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  const registerHref = `${base}/register`;
  const loginHref = `${base}/login`;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-border shadow-sm p-8 space-y-6 text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: `${primary}1a`, color: primary }}
      >
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Willkommen im Team!</h2>
        <p className="text-sm text-muted-foreground">Wir freuen uns, dass Sie dabei sind.</p>
        <p className="text-sm text-foreground">
          Ihr Profil hat uns überzeugt – lassen Sie uns direkt starten!
        </p>
      </div>

      <div className="text-left bg-muted/40 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold">Wie geht es weiter?</p>
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-xs font-semibold"
            style={{ background: primary }}
          >
            <UserPlus className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm">Registrieren Sie sich im Mitarbeiterportal</span>
        </div>
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-xs font-semibold"
            style={{ background: primary }}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm">Führen Sie anschließend das Onboarding durch</span>
        </div>
      </div>

      <Button
        asChild
        size="lg"
        className="w-full font-semibold"
        style={{ background: primary }}
      >
        <a href={registerHref}>Jetzt registrieren</a>
      </Button>

      <div className="text-left text-sm text-muted-foreground space-y-1 pt-2 border-t border-border">
        <p className="text-foreground">Ich wünsche Ihnen einen erfolgreichen Start!</p>
        <p>Mit freundlichen Grüßen</p>
        <p className="font-semibold text-foreground">{recruiter}</p>
        <p>HR Management</p>
        <p>{company}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        Bereits registriert?{" "}
        <a href={loginHref} className="underline hover:text-foreground">
          Zum Login
        </a>
      </p>
    </div>
  );
}

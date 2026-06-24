// Öffentliche Chat-Oberfläche für das KI-Bewerbungsgespräch.
// Aufruf: /interview/<appId>?landing=<slug>&portal=<base>
// Nach Abschluss: Weiterleitung zu /bewerbung/verbinden (Calendly) wenn vorhanden,
// sonst Danke-Screen.

import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Send, CheckCircle2 } from "lucide-react";

type Msg = { role: "user" | "assistant"; text: string; ts: string };

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
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(600);
  const [branding, setBranding] = useState<{ firmenname?: string; primary_color?: string; logo_url?: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const MAX_SEC = 600; // 10 Minuten

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

  // Init: Bewerbung + Verlauf laden, ggf. KI-Gruß holen
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { data: app, error: e1 } = await supabase
          .from("applications")
          .select("interview_messages, interview_status, interview_mode")
          .eq("id", appId)
          .maybeSingle();
        if (e1) throw new Error(e1.message);
        if (!app) throw new Error("Bewerbung nicht gefunden");

        const history: Msg[] = Array.isArray(app.interview_messages) ? (app.interview_messages as any) : [];

        if (app.interview_status === "done" || app.interview_status === "taken_over") {
          if (cancelled) return;
          setMessages(history);
          setEnded(true);
          setInitializing(false);
          return;
        }

        if (history.length === 0) {
          // Frage KI-Gruß ab
          const res = await fetch("/api/public/interview-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ applicationId: appId, action: "init" }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? "Init fehlgeschlagen");
          if (cancelled) return;
          setMessages(data.history ?? []);
        } else {
          if (cancelled) return;
          setMessages(history);
        }
        setInitializing(false);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Unbekannter Fehler");
        setInitializing(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [appId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading || ended) return;
    setInput("");
    setLoading(true);
    // optimistic
    setMessages((prev) => [...prev, { role: "user", text, ts: new Date().toISOString() }]);
    try {
      const res = await fetch("/api/public/interview-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: appId, action: "message", text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Fehler");
      setMessages(data.history ?? []);
      if (data.ended) setEnded(true);
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
      const res = await fetch("/api/public/interview-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: appId, action: "end" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Fehler");
      setEnded(true);
    } catch (e: any) {
      setError(e?.message ?? "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  const company = branding?.firmenname || "uns";
  const primary = branding?.primary_color || "#2563eb";

  const calendlyHref = useMemo(() => {
    if (!portal || !landing) return null;
    const base = portal.replace(/\/+$/, "");
    return `${base}/bewerbung/verbinden?app=${encodeURIComponent(appId)}&landing=${encodeURIComponent(landing)}`;
  }, [portal, landing, appId]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <header className="border-b border-border bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          {branding?.logo_url && <img src={branding.logo_url} alt={company} className="h-8 object-contain" />}
          <div>
            <h1 className="text-sm font-semibold text-foreground">Bewerbungsgespräch mit {company}</h1>
            <p className="text-xs text-muted-foreground">KI-gestütztes Erstgespräch · Dauert ca. 5 Minuten</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 flex flex-col">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[300px]">
          {initializing && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: primary }} />
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-white dark:bg-slate-800 border border-border rounded-bl-sm"
                }`}
                style={m.role === "user" ? { background: primary } : undefined}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && !ended && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-slate-800 border border-border rounded-2xl rounded-bl-sm px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {ended ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-border p-6 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 mx-auto" style={{ color: primary }} />
            <h2 className="text-lg font-semibold">Vielen Dank für das Gespräch!</h2>
            <p className="text-sm text-muted-foreground">
              Ihre Antworten wurden gespeichert. {calendlyHref ? "Sie werden gleich zur Terminbuchung weitergeleitet." : "Wir melden uns in Kürze bei Ihnen."}
            </p>
            {calendlyHref && (
              <Button size="lg" className="w-full" style={{ background: primary }} onClick={() => { window.location.href = calendlyHref!; }}>
                Weiter zur Terminbuchung
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ihre Antwort…"
                disabled={loading || initializing}
                className="flex-1 px-4 py-3 rounded-xl border border-border bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button onClick={send} disabled={loading || initializing || !input.trim()} size="lg" style={{ background: primary }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            {messages.length > 2 && (
              <button
                onClick={endInterview}
                disabled={loading}
                className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
              >
                Gespräch beenden
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

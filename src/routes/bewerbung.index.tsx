// Öffentliche /bewerbung-Seite: Bewerber gibt seine E-Mail ein und wird –
// falls eine Bewerbung vorliegt – zur Terminbuchung (Calendly via
// /bewerbung/verbinden) weitergeleitet. Andernfalls erhält er eine
// passende Statusmeldung.
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Loader2, Mail, CalendarCheck2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/bewerbung/")({
  head: () => ({
    meta: [
      { title: "Bewerbung – Termin buchen" },
      { name: "description", content: "Gib deine E-Mail-Adresse ein, um deinen Bewerbungs­termin zu buchen oder den Status deiner Bewerbung zu prüfen." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BewerbungLookupPage,
});

type LookupResult =
  | { found: false; message: string }
  | { found: true; booked: true; message: string }
  | { found: true; booked: false; redirect_url?: string; message?: string };

const REDIRECT_SECONDS = 15;

function BewerbungLookupPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (redirectUrl) window.location.href = redirectUrl;
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, redirectUrl]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!email.trim()) return;
    setLoading(true);
    try {
      const portalUrl = typeof window !== "undefined" ? window.location.origin : undefined;
      const res = await fetch("/api/public/application-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), portal_url: portalUrl }),
      });
      let data: any = null;
      try { data = await res.json(); } catch { /* ignore */ }
      if (!res.ok) {
        const serverMsg = data?.error || `Server antwortete mit Status ${res.status}`;
        throw new Error(serverMsg);
      }
      setResult(data as LookupResult);
      if (data?.found && !data?.booked && data?.redirect_url) {
        setTimeout(() => { window.location.href = data.redirect_url; }, 600);
      }
    } catch (err: any) {
      const msg = err?.message || "Unbekannter Fehler";
      // Netzwerk vs. Server-Fehler unterscheiden
      if (msg === "Failed to fetch" || /NetworkError/i.test(msg)) {
        setError("Verbindung zum Server fehlgeschlagen. Bitte Internet prüfen und erneut versuchen.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
            <CalendarCheck2 className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold mb-1">Bewerbung &amp; Termin</h1>
          <p className="text-sm text-muted-foreground">
            Gib die E-Mail-Adresse aus deiner Bewerbung ein, um deinen Termin zu buchen oder den Status zu prüfen.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="email"
              required
              autoFocus
              placeholder="deine@email.de"
              className="pl-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Prüfe…</> : "Termin / Status prüfen"}
          </Button>
        </form>

        {error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="mt-5 rounded-lg border p-4 text-sm">
            {!result.found && (
              <>
                <p className="font-medium mb-1">Keine Bewerbung gefunden</p>
                <p className="text-muted-foreground">{result.message}</p>
              </>
            )}
            {result.found && "booked" in result && result.booked && (
              <>
                <p className="font-medium mb-1 text-emerald-700 dark:text-emerald-400">Termin bereits gebucht</p>
                <p className="text-muted-foreground">{result.message}</p>
              </>
            )}
            {result.found && "booked" in result && !result.booked && "redirect_url" in result && result.redirect_url && (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Du wirst zur Terminbuchung weitergeleitet…</span>
              </div>
            )}
            {result.found && "booked" in result && !result.booked && !("redirect_url" in result && result.redirect_url) && (
              <p className="text-muted-foreground">{(result as any).message}</p>
            )}
          </div>
        )}

        <p className="mt-6 text-xs text-muted-foreground text-center">
          Du hast noch keine Bewerbung abgeschickt? Dann bewirb dich zuerst über die Landing-Page, auf der du gelandet bist.
        </p>
      </div>
    </div>
  );
}

// Magic-Link-Landing für den neuen Vermittlung→Fasttrack-Flow:
// - Mit ?token=<uuid> → Lookup über /api/public/application-by-token → Start
//   des KI-Bewerbungsgesprächs (/interview/:appId).
// - Ohne Token → Redirect aufs Mitarbeiter-Portal (Direktbewerbung über die
//   Landing ist deaktiviert; Bewerbung läuft ausschließlich über Vermittlung
//   + Calendly-Buchung + E-Mail mit Magic-Link).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/bewerbung/")({
  head: () => ({
    meta: [
      { title: "Ihr Bewerbungsgespräch" },
      { name: "description", content: "Starten Sie hier Ihr KI-Bewerbungsgespräch." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BewerbungLandingPage,
});

declare global {
  interface Window {
    PORTAL_URL?: string;
    PORTAL_API?: string;
  }
}

type LookupState =
  | { kind: "loading" }
  | { kind: "no-token" }
  | { kind: "invalid" }
  | { kind: "ready"; appId: string; fullName?: string };

function BewerbungLandingPage() {
  const [state, setState] = useState<LookupState>({ kind: "loading" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    // No token → Direktbewerbung über Landing ist deaktiviert.
    if (!token) {
      const portal = (window.PORTAL_URL || "").trim();
      if (portal) {
        window.location.replace(portal.replace(/\/+$/, "") + "/login");
        return;
      }
      setState({ kind: "no-token" });
      return;
    }

    // Token → Application laden
    (async () => {
      try {
        const res = await fetch("/api/public/application-by-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          setState({ kind: "invalid" });
          return;
        }
        const data = await res.json();
        if (!data?.ok || !data?.application_id) {
          setState({ kind: "invalid" });
          return;
        }
        setState({ kind: "ready", appId: data.application_id, fullName: data.full_name });
      } catch {
        setState({ kind: "invalid" });
      }
    })();
  }, []);

  const startInterview = () => {
    if (state.kind !== "ready") return;
    const portal = ((typeof window !== "undefined" && window.PORTAL_URL) || "").trim();
    const base = portal ? portal.replace(/\/+$/, "") : "";
    window.location.href = `${base}/interview/${state.appId}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
        {state.kind === "loading" && (
          <>
            <Loader2 className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-spin" />
            <h1 className="text-xl font-semibold">Einen Moment …</h1>
          </>
        )}

        {state.kind === "no-token" && (
          <>
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <h1 className="text-2xl font-bold mb-2">Kein Bewerbungslink</h1>
            <p className="text-sm text-muted-foreground">
              Bitte buchen Sie zunächst einen Termin über die Vermittlungsseite. Sie erhalten
              anschließend per E-Mail einen persönlichen Link zu Ihrem Bewerbungsgespräch.
            </p>
          </>
        )}

        {state.kind === "invalid" && (
          <>
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h1 className="text-2xl font-bold mb-2">Link ungültig oder abgelaufen</h1>
            <p className="text-sm text-muted-foreground">
              Dieser Bewerbungslink ist nicht mehr gültig. Bitte buchen Sie einen neuen Termin
              oder kontaktieren Sie uns per E-Mail.
            </p>
          </>
        )}

        {state.kind === "ready" && (
          <>
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 text-xl font-bold">
              ✓
            </div>
            <h1 className="text-2xl font-bold mb-1">Willkommen{state.fullName ? `, ${state.fullName.split(" ")[0]}` : ""}!</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Ihr Termin ist bestätigt. Bitte starten Sie jetzt Ihr kurzes KI-Bewerbungsgespräch
              — es dauert nur wenige Minuten.
            </p>
            <Button
              onClick={startInterview}
              className="w-full h-12 text-base rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              Bewerbungsgespräch starten <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

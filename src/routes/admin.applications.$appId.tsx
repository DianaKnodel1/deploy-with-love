import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/applications/$appId")({
  component: AdminApplicationDetailPage,
});

import { useParams, useNavigate } from "@/lib/router-compat";
import { useAdminData } from "@/contexts/AdminDataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Copy, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

function AdminApplicationDetailPage() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { applications, loading, loadData } = useAdminData();
  const [accepting, setAccepting] = useState(false);
  const [resending, setResending] = useState(false);
  const [tenantInfo, setTenantInfo] = useState<{ name: string; domain: string; primary_domain: string | null } | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const app = applications.find((a) => a.id === appId);

  useEffect(() => {
    if (!app?.tenant_id) return;
    supabase.from("tenants").select("name, domain, primary_domain").eq("id", app.tenant_id).maybeSingle().then(({ data }) => {
      if (data) setTenantInfo(data as any);
    });
  }, [app]);

  const sendWelcomeEmail = async () => {
    if (!app) return false;
    try {
      const portalLink = tenantInfo?.domain
        ? `https://portal.${tenantInfo.primary_domain ?? tenantInfo.domain}/register`
        : `${window.location.origin}/register`;

      const { data, error } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          to: app.email,
          fullName: app.full_name,
          firstName: app.first_name,
          lastName: app.last_name,
          registrationLink: portalLink,
          tenantId: app.tenant_id,
        },
      });
      if (error) throw new Error(error.message || "Edge function error");
      if (data && data.error) throw new Error(data.error);
      setEmailError(null);
      return true;
    } catch (err: any) {
      setEmailError(err?.message || "Unbekannter Fehler beim E-Mail-Versand");
      return false;
    }
  };

  const acceptApplication = async () => {
    if (!appId || !app) return;
    setAccepting(true);
    setEmailError(null);

    const { error: updateError } = await supabase.from("applications").update({ status: "akzeptiert" }).eq("id", appId);
    if (updateError) {
      toast({ title: "Fehler", description: updateError.message, variant: "destructive" });
      setAccepting(false);
      return;
    }

    // Send welcome email (no token needed)
    const emailSent = await sendWelcomeEmail();

    toast({
      title: emailSent ? "Bewerbung akzeptiert" : "Bewerbung akzeptiert – E-Mail fehlgeschlagen",
      description: emailSent
        ? "Willkommensmail wurde gesendet."
        : "E-Mail konnte nicht gesendet werden. Link unten manuell kopieren.",
      variant: emailSent ? "default" : "destructive",
    });

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        await supabase.from("activity_log").insert({
          action: "bewerbung_akzeptiert", entity_type: "application", entity_id: appId,
          actor_id: currentUser.id, comment: `Bewerbung von ${app.full_name} akzeptiert.`,
          old_status: app.status, new_status: "akzeptiert",
        });
      }
    } catch { /* Non-critical */ }

    setAccepting(false);
    loadData();
  };

  const resendEmail = async () => {
    if (!app) return;
    setResending(true);
    setEmailError(null);
    const emailSent = await sendWelcomeEmail();
    toast({
      title: emailSent ? "Willkommensmail erneut gesendet" : "E-Mail fehlgeschlagen",
      description: emailSent ? "E-Mail wurde erfolgreich versendet." : "Fehler beim Versand.",
      variant: emailSent ? "default" : "destructive",
    });
    setResending(false);
  };

  const portalLink = tenantInfo?.domain
    ? `https://portal.${tenantInfo.primary_domain ?? tenantInfo.domain}/register`
    : `${window.location.origin}/register`;

  const copyLink = () => {
    navigator.clipboard.writeText(portalLink);
    toast({ title: "Kopiert", description: "Portal-Link in die Zwischenablage kopiert." });
  };

  const rejectApplication = async () => {
    if (!appId || !app) return;
    const { error } = await supabase.from("applications").update({ status: "abgelehnt" }).eq("id", appId);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        await supabase.from("activity_log").insert({
          action: "bewerbung_abgelehnt", entity_type: "application", entity_id: appId,
          actor_id: currentUser.id, comment: `Bewerbung von ${app.full_name} abgelehnt.`,
          old_status: app.status, new_status: "abgelehnt",
        });
      }
    } catch { /* Non-critical */ }
    toast({ title: "Bewerbung abgelehnt" });
    loadData();
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Laden…</div>;
  if (!app) return (
    <div className="p-5">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/applications")}><ArrowLeft className="h-4 w-4 mr-1" /> Zurück</Button>
      <p className="text-sm text-muted-foreground mt-4">Bewerbung nicht gefunden.</p>
    </div>
  );

  return (
    <div className="p-5 space-y-5 max-w-2xl">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/applications")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
      </Button>

      <div>
        <h1 className="text-lg font-heading font-bold text-foreground">{app.full_name}</h1>
        <p className="text-xs text-muted-foreground">Eingegangen am {new Date(app.created_at).toLocaleDateString("de-DE")}</p>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Persönliche Daten</p>
          <InfoRow label="Vorname" value={app.first_name || "–"} />
          <InfoRow label="Nachname" value={app.last_name || "–"} />
          <InfoRow label="E-Mail" value={app.email} />
          <InfoRow label="Telefon" value={app.phone || "–"} />

          <div className="border-t border-border pt-2 mt-2" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adresse</p>
          <InfoRow label="Anschrift" value={app.address || "–"} />
          <InfoRow label="PLZ" value={app.postal_code || "–"} />
          <InfoRow label="Stadt" value={app.city || "–"} />

          <div className="border-t border-border pt-2 mt-2" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Geburt & Nationalität</p>
          <InfoRow label="Geburtsdatum" value={app.birth_date ? new Date(app.birth_date).toLocaleDateString("de-DE") : "–"} />
          <InfoRow label="Geburtsort" value={app.birth_place || "–"} />
          <InfoRow label="Staatsangehörigkeit" value={app.nationality || "–"} />

          <div className="border-t border-border pt-2 mt-2" />
          <InfoRow label="Status" value={app.status} />
          {tenantInfo && <InfoRow label="Tenant / Domain" value={`${tenantInfo.name} (${tenantInfo.domain})`} />}
          <InfoRow label="Eingegangen" value={new Date(app.created_at).toLocaleString("de-DE")} />

          <div className="pt-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground mb-1">Nachricht</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{app.message || "–"}</p>
          </div>
        </CardContent>
      </Card>

      <InterviewSection app={app as any} />


      {(app as any).booking_status && (app as any).booking_status !== "none" && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              🤝 Vermittlung / Termin
            </p>
            <InfoRow label="Flow" value={(app as any).flow_type === "broker" ? "Vermittlung" : ((app as any).flow_type ?? "–")} />
            <InfoRow
              label="Buchungs-Status"
              value={
                {
                  pending: "⏳ Termin offen",
                  scheduled: "📅 Gebucht",
                  cancelled: "✖ Abgesagt",
                  no_show: "👻 No-Show",
                  completed: "✔ Wahrgenommen",
                }[(app as any).booking_status as string] ?? (app as any).booking_status
              }
            />
            {(app as any).scheduled_at && (
              <InfoRow
                label="Termin"
                value={new Date((app as any).scheduled_at).toLocaleString("de-DE", {
                  weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              />
            )}
            {(app as any).calendly_event_uri && (
              <div className="flex justify-between text-sm gap-2">
                <span className="text-muted-foreground shrink-0">Calendly-Event</span>
                <a
                  href={(app as any).calendly_event_uri}
                  target="_blank"
                  rel="noopener"
                  className="text-foreground font-mono text-xs underline truncate"
                  title={(app as any).calendly_event_uri}
                >
                  Im Calendly öffnen ↗
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {app.status !== "akzeptiert" && app.status !== "abgelehnt" && (
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={rejectApplication}>
            <XCircle className="h-3.5 w-3.5 mr-1" /> Ablehnen
          </Button>
          <Button size="sm" onClick={acceptApplication} disabled={accepting}>
            {accepting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            {accepting ? "Wird akzeptiert…" : "Akzeptieren & Einladen"}
          </Button>
        </div>
      )}

      {app.status === "akzeptiert" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/5 border border-accent/15">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            <span className="text-sm text-foreground">Bewerbung akzeptiert – Willkommensmail gesendet</span>
          </div>

          {emailError && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              <p className="font-medium mb-1">E-Mail-Versand fehlgeschlagen</p>
              <p className="text-xs opacity-80">{emailError}</p>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={resendEmail} disabled={resending}>
              {resending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Willkommensmail erneut senden
            </Button>
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Portal-Link kopieren
            </Button>
          </div>

          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-[11px] text-muted-foreground mb-1">Portal-Link (Fallback)</p>
            <p className="text-xs text-foreground font-mono break-all select-all">{portalLink}</p>
          </div>
        </div>
      )}

      {app.status === "abgelehnt" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/15">
          <XCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-foreground">Bewerbung abgelehnt</span>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

function InterviewSection({ app }: { app: any }) {
  const mode = app.interview_mode as "chat" | "voice" | null;
  const status = app.interview_status as string | undefined;
  const messages = Array.isArray(app.interview_messages) ? app.interview_messages : [];
  const summary = app.interview_summary as string | null;
  const score = app.interview_score as number | null;
  const recommendation = app.interview_recommendation as "invite" | "reject" | "unsure" | null;

  if (!mode && (!status || status === "pending") && messages.length === 0) {
    return null;
  }

  const recBadge = recommendation === "invite"
    ? { label: "✅ Empfohlen", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" }
    : recommendation === "reject"
    ? { label: "❌ Nicht empfohlen", cls: "bg-red-100 text-red-800 border-red-200" }
    : recommendation === "unsure"
    ? { label: "⚠️ Unsicher", cls: "bg-amber-100 text-amber-800 border-amber-200" }
    : null;

  const statusLabel: Record<string, string> = {
    pending: "Noch nicht gestartet",
    running: "Läuft gerade",
    done: "Abgeschlossen",
    taken_over: "Vom Admin übernommen",
    skipped: "Übersprungen",
  };

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            🤖 KI-Bewerbungsgespräch
          </p>
          <div className="flex items-center gap-2">
            {mode && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted border border-border">
                {mode === "voice" ? "🎙️ Telefon" : "💬 Chat"}
              </span>
            )}
            {status && (
              <span className="text-xs text-muted-foreground">{statusLabel[status] ?? status}</span>
            )}
          </div>
        </div>

        {summary && (
          <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              {typeof score === "number" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Score:</span>
                  <span className="text-sm font-semibold">{score}/100</span>
                  <div className="h-1.5 w-24 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${score}%`,
                        background: score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444",
                      }}
                    />
                  </div>
                </div>
              )}
              {recBadge && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${recBadge.cls}`}>
                  {recBadge.label}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{summary}</p>
          </div>
        )}

        {messages.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Transkript ({messages.length} Nachrichten)
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {messages.map((m: any, i: number) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary/10 border border-primary/20"
                        : "bg-muted border border-border"
                    }`}
                  >
                    <p className="text-[10px] text-muted-foreground mb-0.5">
                      {m.role === "user" ? "Bewerber" : "KI-Recruiter"}
                      {m.ts && ` · ${new Date(m.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


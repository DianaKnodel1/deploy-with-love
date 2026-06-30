import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle,
  Send, CalendarCheck, BellRing, KeyRound, UserPlus, MessageCircle, ChevronRight,
} from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { AdminEmailLogsPage } from "./admin.email-logs";
import { AdminRemindersPage } from "./admin.reminders";
import { AdminRecoveryPage } from "./admin.recovery";
import { CronHealthPanel } from "@/components/CronHealthPanel";
import type { EmailLog } from "@/lib/email-stats";

const searchSchema = z.object({
  view: z.enum(["start", "logs", "reminders", "recovery", "cron"]).optional().catch("start"),
});

export const Route = createFileRoute("/admin/email-center")({
  validateSearch: searchSchema,
  component: AdminEmailCenterPage,
});

/* ------------------------------- Mail-Katalog ------------------------------- *
 * Spiegelt den aktuellen Bewerber-/Mitarbeiter-Flow wider. Ein Eintrag pro
 * tatsächlich verwendetem Trigger; tote Templates (Drip, Bewerbungs­eingang)
 * sind hier bewusst nicht mehr aufgeführt.
 * --------------------------------------------------------------------------- */

type FlowMail = {
  key: string;
  /** Phase im Flow */
  group: "Bewerbung" | "Onboarding" | "Auth" | "Reminder" | "Support";
  title: string;
  trigger: string;
  /** Suchmuster auf template_name in email_send_log */
  templates: string[];
  icon: any;
};

const FLOW_MAILS: FlowMail[] = [
  {
    key: "calendly_confirm",
    group: "Bewerbung",
    title: "Terminbestätigung (Calendly)",
    trigger: "Sofort nach Terminbuchung durch Bewerber",
    templates: ["calendly_confirmation"],
    icon: CalendarCheck,
  },
  {
    key: "no_show_reminders",
    group: "Reminder",
    title: "No-Show Reminder",
    trigger: "2 h / 24 h / 72 h nach verpasstem Termin",
    templates: ["reminder_no_show_2h", "reminder_no_show_24h", "reminder_no_show_72h"],
    icon: BellRing,
  },
  {
    key: "acceptance",
    group: "Onboarding",
    title: "Annahme & Registrierungs-Einladung",
    trigger: "Nach erfolgreichem Interview (Empfehlung „invite")",
    templates: ["invitation", "auth_invite"],
    icon: UserPlus,
  },
  {
    key: "reg_reminders",
    group: "Reminder",
    title: "Registrierungs-Reminder",
    trigger: "Wenn Bewerber Einladung nicht annimmt",
    templates: ["reminder_invite", "reminder_confirm_email", "reminder_complete_registration"],
    icon: Send,
  },
  {
    key: "auth_password_reset",
    group: "Auth",
    title: "Passwort zurücksetzen",
    trigger: "Wenn User auf „Passwort vergessen" klickt",
    templates: ["auth_recovery"],
    icon: KeyRound,
  },
  {
    key: "appointment_30min",
    group: "Reminder",
    title: "30-Minuten Termin-Reminder",
    trigger: "30 Min vor gebuchtem Termin (Cron)",
    templates: ["appointment_reminder_30min", "reminder_appointment"],
    icon: Clock,
  },
  {
    key: "chat_reminder",
    group: "Support",
    title: "Chat-Reminder",
    trigger: "Unbeantwortete Chat-Nachricht > X Min",
    templates: ["chat_reminder"],
    icon: MessageCircle,
  },
];

type MailStat = { sent24: number; pending: number; failed24: number; lastSent: string | null };

/* --------------------------------- Layout --------------------------------- */

function AdminEmailCenterPage() {
  const search = useSearch({ from: "/admin/email-center" });
  const navigate = useNavigate();
  const view = (search as any).view ?? "start";

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold">E-Mail-Center</h1>
            <p className="text-sm text-muted-foreground">
              Was wird wann verschickt — und hat es geklappt?
            </p>
          </div>
        </div>
        {view !== "start" && (
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/email-center")}>
            ← Zurück zur Übersicht
          </Button>
        )}
      </header>

      {view === "start" && <StartView onOpen={(v) => navigate(`/admin/email-center?view=${v}`)} />}
      {view === "logs" && (<div className="-mx-6 lg:-mx-8 -mb-6 lg:-mb-8"><AdminEmailLogsPage /></div>)}
      {view === "reminders" && (<div className="-mx-6 lg:-mx-8 -mb-6 lg:-mb-8"><AdminRemindersPage /></div>)}
      {view === "recovery" && (<div className="-mx-6 lg:-mx-8 -mb-6 lg:-mb-8"><AdminRecoveryPage /></div>)}
      {view === "cron" && <CronHealthPanel />}
    </div>
  );
}

/* --------------------------------- Start-View --------------------------------- */

function StartView({ onOpen }: { onOpen: (v: "logs" | "reminders" | "recovery" | "cron") => void }) {
  const [loading, setLoading] = useState(true);
  const [statsByTemplate, setStatsByTemplate] = useState<Record<string, MailStat>>({});
  const [recentFailures, setRecentFailures] = useState<EmailLog[]>([]);
  const [totals, setTotals] = useState({ sent: 0, pending: 0, failed: 0 });

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data } = await supabase
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, metadata, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    const rows = (data ?? []) as EmailLog[];
    const map: Record<string, MailStat> = {};
    const fails: EmailLog[] = [];
    let sent = 0, pending = 0, failed = 0;
    for (const r of rows) {
      const t = r.template_name || "unknown";
      const cur = (map[t] ??= { sent24: 0, pending: 0, failed24: 0, lastSent: null });
      if (r.status === "sent") {
        cur.sent24++; sent++;
        if (!cur.lastSent) cur.lastSent = r.created_at;
      } else if (r.status === "pending") {
        cur.pending++; pending++;
      } else if (r.status === "failed" || r.status === "dlq" || r.status === "bounced") {
        cur.failed24++; failed++;
        if (fails.length < 8) fails.push(r);
      }
    }
    setStatsByTemplate(map);
    setRecentFailures(fails);
    setTotals({ sent, pending, failed });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const mailStats = useMemo(() => {
    return FLOW_MAILS.map(m => {
      const agg: MailStat = { sent24: 0, pending: 0, failed24: 0, lastSent: null };
      for (const tpl of m.templates) {
        const s = statsByTemplate[tpl];
        if (!s) continue;
        agg.sent24 += s.sent24;
        agg.pending += s.pending;
        agg.failed24 += s.failed24;
        if (s.lastSent && (!agg.lastSent || s.lastSent > agg.lastSent)) agg.lastSent = s.lastSent;
      }
      return { ...m, stat: agg };
    });
  }, [statsByTemplate]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi tone="success" icon={CheckCircle2} label="Heute gesendet" value={totals.sent} />
        <Kpi tone={totals.pending > 20 ? "warning" : "neutral"} icon={Clock} label="In Warteschlange" value={totals.pending} />
        <Kpi tone={totals.failed > 0 ? "danger" : "neutral"} icon={XCircle} label="Fehler heute" value={totals.failed} />
      </div>

      {totals.pending > 20 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-200">
            <strong>{totals.pending}</strong> Mails hängen in der Warteschlange. Falls das in 5 Minuten
            nicht sinkt, prüfe „Cron-Health".
          </div>
        </div>
      )}

      {/* Aktive Mails im Flow */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold">Aktive Mails im Bewerber-Flow</h2>
            <p className="text-xs text-muted-foreground">Nur das, was wirklich verschickt wird — sortiert nach Phase.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Aktualisieren
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {mailStats.map(m => (
            <FlowMailCard key={m.key} mail={m} onOpenLogs={() => onOpen("logs")} />
          ))}
        </div>
      </section>

      {/* Letzte Fehler */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Letzte Probleme (24 h)</h2>
          {recentFailures.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => onOpen("logs")} className="gap-1 text-xs">
              Alles im Protokoll <ChevronRight className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Card>
          <CardContent className="p-0">
            {recentFailures.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                {loading ? "Lade…" : "Keine Probleme. Alles läuft. 🎉"}
              </div>
            ) : (
              <ul className="divide-y">
                {recentFailures.map(f => (
                  <li key={f.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                    <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{f.recipient_email}</div>
                      <div className="text-muted-foreground truncate">
                        <span className="font-mono">{f.template_name}</span>
                        {f.error_message ? <> — {f.error_message}</> : null}
                      </div>
                    </div>
                    <span className="tabular-nums text-muted-foreground shrink-0">
                      {new Date(f.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Mehr / Tools */}
      <section>
        <h2 className="text-base font-semibold mb-3">Mehr</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ToolButton title="Volles Protokoll" desc="Jede Mail · Filter · Re-Send" onClick={() => onOpen("logs")} />
          <ToolButton title="Reminder-Cron" desc="Manuell auslösen + Status" onClick={() => onOpen("reminders")} />
          <ToolButton title="Recovery" desc="Inaktive Domains anstoßen" onClick={() => onOpen("recovery")} />
          <ToolButton title="Cron-Health" desc="Laufen alle Jobs?" onClick={() => onOpen("cron")} />
        </div>
      </section>
    </div>
  );
}

function FlowMailCard({ mail, onOpenLogs }: { mail: FlowMail & { stat: MailStat }; onOpenLogs: () => void }) {
  const { stat } = mail;
  const Icon = mail.icon;
  const isQuiet = stat.sent24 === 0 && stat.pending === 0 && stat.failed24 === 0;
  return (
    <Card className="hover:bg-muted/20 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium text-sm truncate">{mail.title}</h3>
              <Badge variant="secondary" className="text-[10px] shrink-0">{mail.group}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{mail.trigger}</p>

            <div className="flex items-center gap-3 mt-3 text-xs tabular-nums">
              <span className="text-emerald-700 dark:text-emerald-300">
                ✓ {stat.sent24} <span className="text-muted-foreground font-normal">24h</span>
              </span>
              {stat.pending > 0 && (
                <span className="text-amber-700 dark:text-amber-300">⏱ {stat.pending}</span>
              )}
              {stat.failed24 > 0 && (
                <span className="text-rose-700 dark:text-rose-300 font-semibold">✕ {stat.failed24}</span>
              )}
              {isQuiet && <span className="text-muted-foreground italic">Heute noch nichts verschickt</span>}
              <button onClick={onOpenLogs} className="ml-auto text-primary hover:underline">Logs →</button>
            </div>

            {stat.lastSent && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Zuletzt gesendet: {new Date(stat.lastSent).toLocaleString("de-DE")}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ToolButton({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl border bg-card hover:bg-muted/30 hover:border-primary/30 transition-colors group"
    >
      <div className="font-medium text-sm flex items-center justify-between">
        {title}
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
    </button>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: "success" | "danger" | "warning" | "neutral" }) {
  const cls = {
    success: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    danger: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300",
    warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-300",
    neutral: "bg-muted/40 border-border text-foreground",
  }[tone];
  return (
    <Card className={`border ${cls}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className="h-5 w-5 opacity-80" />
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-[11px] opacity-80">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

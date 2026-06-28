// Vermittlungs-Übersicht: kombiniert Vermittlungs-Landings + Fast-Track-Firmen + Calendly-Status.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listLandingPages } from "@/lib/landing-pages.functions";
import { listPartnerCompanies } from "@/lib/partner-companies.functions";
import { listCalendlyAccounts } from "@/lib/calendly.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Handshake, CalendarClock, Globe, Plus, ExternalLink, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin/vermittlung")({
  component: VermittlungOverview,
});

function VermittlungOverview() {
  const listLandings = useServerFn(listLandingPages);
  const listPartners = useServerFn(listPartnerCompanies);
  const listCalendly = useServerFn(listCalendlyAccounts);

  const lQ = useQuery({ queryKey: ["landings-broker"], queryFn: () => listLandings() });
  const pQ = useQuery({ queryKey: ["partner-companies"], queryFn: () => listPartners() });
  const cQ = useQuery({ queryKey: ["calendly-accounts"], queryFn: () => listCalendly() });

  const allLandings: any[] = (lQ.data as any)?.rows ?? [];
  const brokerLandings = allLandings.filter((l) => l.flow_type === "broker");
  const partners: any[] = (pQ.data as any)?.rows ?? [];
  const calendlyAccounts: any[] = (cQ.data as any)?.rows ?? [];

  const needsSetup = partners.length === 0 || calendlyAccounts.length === 0;

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Handshake className="h-6 w-6" /> Vermittlung
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bewerbungen werden über deine Landing-Page eingesammelt und direkt an eine Fast-Track-Firma
          weitergereicht (Terminbuchung via Calendly). Der Bewerber sieht nach dem Absenden inline:
          „Wir verbinden Sie mit [Partner]" und einen Button zur Terminbuchung.
        </p>
      </div>

      {needsSetup && (
        <Card className="border-yellow-300 bg-yellow-50/40">
          <CardContent className="pt-6 flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm">
              <strong>Setup unvollständig.</strong>{" "}
              {calendlyAccounts.length === 0 && (
                <>Lege zuerst einen <Link to="/admin/calendly" className="underline">Calendly-Account</Link> an. </>
              )}
              {partners.length === 0 && (
                <>Lege dann eine <Link to="/admin/partner-companies" className="underline">Fast-Track-Firma</Link> an.</>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <StatCard
          icon={<Globe className="h-5 w-5" />}
          label="Vermittlungs-Landings"
          value={brokerLandings.length}
          to="/admin/landing-generator"
          cta="Landing anlegen"
        />
        <StatCard
          icon={<Handshake className="h-5 w-5" />}
          label="Fast-Track-Firmen"
          value={partners.length}
          to="/admin/partner-companies"
          cta="Partner verwalten"
        />
        <StatCard
          icon={<CalendarClock className="h-5 w-5" />}
          label="Calendly-Accounts"
          value={calendlyAccounts.length}
          to="/admin/calendly"
          cta="Calendly verwalten"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Vermittlungs-Landings</CardTitle>
            <CardDescription>Landings mit Flow-Typ „Vermittlung" (broker)</CardDescription>
          </div>
          <Link to="/admin/landing-generator">
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Neue Landing</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {lQ.isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
          {!lQ.isLoading && brokerLandings.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Vermittlungs-Landings. Erstelle eine im{" "}
              <Link to="/admin/landing-generator" className="underline">Landing-Generator</Link>{" "}
              und wähle dort den Modus „Vermittlung".
            </p>
          )}
          <ul className="space-y-2">
            {brokerLandings.map((l) => (
              <li key={l.id} className="flex items-center justify-between border rounded-md p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{l.branding?.firmenname || l.slug}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {l.domain || "—"} · /{l.source_slug || l.slug}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {l.is_published ? <Badge variant="default">live</Badge> : <Badge variant="secondary">Entwurf</Badge>}
                  {l.domain && (
                    <a href={`https://${l.domain}`} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>So funktioniert der Flow</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Bewerber füllt Formular auf deiner Vermittlungs-Landing aus.</p>
          <p>2. Bewerbung wird im Portal mit Status <code>pending</code> gespeichert.</p>
          <p>3. Inline-Erfolgs-Modal zeigt „Wir verbinden Sie mit [Partner]" + Calendly-Button (neuer Tab).</p>
          <p>4. Nach Terminbuchung: Calendly-Webhook aktualisiert <code>booking_status = scheduled</code>.</p>
          <p>5. Calendly schickt Termin-Bestätigung; Bewerber registriert sich später im Portal des Partners.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, to, cta }: { icon: React.ReactNode; label: string; value: number; to: string; cta: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">{icon} {label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <Link to={to}><Button size="sm" variant="outline" className="w-full">{cta}</Button></Link>
      </CardContent>
    </Card>
  );
}

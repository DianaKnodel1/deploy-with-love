import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listCalendlyAccounts, saveCalendlyAccount, deleteCalendlyAccount } from "@/lib/calendly.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, Trash2, Plus, Link2 } from "lucide-react";

export const Route = createFileRoute("/admin/calendly")({
  component: AdminCalendlyPage,
});

function AdminCalendlyPage() {
  const list = useServerFn(listCalendlyAccounts);
  const save = useServerFn(saveCalendlyAccount);
  const del = useServerFn(deleteCalendlyAccount);
  const { toast } = useToast();

  const q = useQuery({ queryKey: ["calendly-accounts"], queryFn: () => list() });

  const [displayName, setDisplayName] = useState("");
  const [userUri, setUserUri] = useState("");
  const [signingKey, setSigningKey] = useState("");
  const [saving, setSaving] = useState(false);

  const portalOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${portalOrigin}/api/public/calendly-webhook`;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await save({ data: { display_name: displayName, calendly_user_uri: userUri, webhook_signing_key: signingKey } });
      toast({ title: "Account gespeichert" });
      setDisplayName(""); setUserUri(""); setSigningKey("");
      q.refetch();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message ?? String(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Account wirklich löschen?")) return;
    await del({ data: { id } });
    toast({ title: "Gelöscht" });
    q.refetch();
  }

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    toast({ title: `${label} kopiert` });
  }

  const rows = (q.data as any)?.rows ?? [];

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendly-Integration</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bewerbungsgespräche per Calendly buchen lassen. Pro Account einen
          Webhook in Calendly registrieren, damit gebuchte Termine automatisch
          im Portal als "Termin gebucht" auftauchen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> Webhook-URL</CardTitle>
          <CardDescription>
            Diese URL trägst du in Calendly als Webhook ein (Calendly → Integrations → Webhooks → "Create Webhook Subscription").
            Events: <strong>invitee.created</strong>, <strong>invitee.canceled</strong>, <strong>invitee_no_show.created</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button variant="outline" onClick={() => copy(webhookUrl, "URL")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Calendly zeigt nach dem Anlegen einen <strong>Signing Key</strong> an —
            den unten als "Webhook Signing Key" hinterlegen. Damit verifizieren
            wir, dass eingehende Webhooks wirklich von Calendly stammen.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Account hinzufügen</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <Label>Bezeichnung</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="z.B. Sabine Schneider" required />
            </div>
            <div>
              <Label>Calendly-User-URI (optional)</Label>
              <Input value={userUri} onChange={(e) => setUserUri(e.target.value)} placeholder="https://api.calendly.com/users/..." />
            </div>
            <div>
              <Label>Webhook Signing Key</Label>
              <Input value={signingKey} onChange={(e) => setSigningKey(e.target.value)} placeholder="aus Calendly nach Webhook-Erstellung" required type="password" />
            </div>
            <Button type="submit" disabled={saving}>Speichern</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hinterlegte Accounts ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
          {q.error && <p className="text-sm text-red-600">{(q.error as any)?.message ?? String(q.error)}</p>}
          {!q.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Accounts hinterlegt.</p>
          )}
          <ul className="space-y-2">
            {rows.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <div className="font-medium">{r.display_name}</div>
                  {r.calendly_user_uri && <div className="text-xs text-muted-foreground">{r.calendly_user_uri}</div>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calendly-Link pro Landing</CardTitle>
          <CardDescription>
            Den eigentlichen Buchungs-Link (z.B. <code>https://calendly.com/sabine-schneider/bewerbung</code>) trägst du im
            <strong> Landing-Generator</strong> ein — pro Landing eigenes Event-Type möglich.
            Sobald gesetzt, leitet die Bewerbung automatisch über die
            Zwischenseite "Sie werden mit … verbunden" zu Calendly weiter.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

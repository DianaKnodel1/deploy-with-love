// Öffentliches Bewerbungsformular. Wird von allen Landing-Themes über
// {{cta_url}} = "/bewerbung" angesprungen. Erfasst Stammdaten, schickt sie
// an /api/public/applications und leitet je nach Flow weiter (Calendly,
// Interview, Fast-Track, Vermittlung) bzw. zeigt eine Erfolgsmeldung.
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/bewerbung/")({
  head: () => ({
    meta: [
      { title: "Jetzt bewerben" },
      { name: "description", content: "Bewirb dich in wenigen Minuten – kostenlos und unverbindlich." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BewerbungFormPage,
});

type FormState = {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  nationalitaet: string;
  adresse: string;
  plz: string;
  ort: string;
  geburtsdatum: string;
  geburtsort: string;
  datenschutz: boolean;
};

const INITIAL: FormState = {
  vorname: "", nachname: "", email: "", telefon: "", nationalitaet: "",
  adresse: "", plz: "", ort: "", geburtsdatum: "", geburtsort: "",
  datenschutz: false,
};

function BewerbungFormPage() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const urlContext = useMemo(() => {
    if (typeof window === "undefined") return { source_slug: null as string | null, portal_url: null as string | null };
    const p = new URLSearchParams(window.location.search);
    return {
      source_slug: p.get("landing") || p.get("source") || p.get("slug"),
      portal_url: p.get("portal") || window.location.origin,
    };
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.datenschutz) {
      setError("Bitte stimme der Datenschutzerklärung zu.");
      return;
    }
    setLoading(true);
    try {
      const full_name = `${form.vorname.trim()} ${form.nachname.trim()}`.trim();
      const messageParts = [
        form.nationalitaet && `Nationalität: ${form.nationalitaet.trim()}`,
        form.adresse && `Adresse: ${form.adresse.trim()}`,
        form.geburtsdatum && `Geburtsdatum: ${form.geburtsdatum}`,
        form.geburtsort && `Geburtsort: ${form.geburtsort.trim()}`,
      ].filter(Boolean).join("\n");

      const res = await fetch("/api/public/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name,
          email: form.email.trim(),
          phone: form.telefon.trim() || null,
          postal_code: form.plz.trim() || null,
          city: form.ort.trim() || null,
          message: messageParts || null,
          source_slug: urlContext.source_slug,
          portal_url: urlContext.portal_url,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Fehler ${res.status}`);
      }
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || "Unbekannter Fehler. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
          <h1 className="text-2xl font-bold mb-2">Bewerbung erhalten</h1>
          <p className="text-sm text-muted-foreground">
            Vielen Dank! Wir melden uns in der Regel innerhalb von 14 Tagen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-10">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field id="vorname" label="Vorname" required value={form.vorname} onChange={(v) => set("vorname", v)} />
              <Field id="nachname" label="Nachname" required value={form.nachname} onChange={(v) => set("nachname", v)} />
            </div>
            <Field id="email" type="email" label="E-Mail" required value={form.email} onChange={(v) => set("email", v)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field id="telefon" type="tel" label="Telefon" value={form.telefon} onChange={(v) => set("telefon", v)} />
              <Field id="nationalitaet" label="Nationalität" value={form.nationalitaet} onChange={(v) => set("nationalitaet", v)} />
            </div>
            <Field id="adresse" label="Adresse" value={form.adresse} onChange={(v) => set("adresse", v)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field id="plz" label="PLZ" value={form.plz} onChange={(v) => set("plz", v)} />
              <Field id="ort" label="Ort" value={form.ort} onChange={(v) => set("ort", v)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field id="geburtsdatum" type="date" label="Geburtsdatum" value={form.geburtsdatum} onChange={(v) => set("geburtsdatum", v)} />
              <Field id="geburtsort" label="Geburtsort" value={form.geburtsort} onChange={(v) => set("geburtsort", v)} />
            </div>

            <label className="flex items-start gap-3 pt-2 cursor-pointer">
              <Checkbox
                id="datenschutz"
                checked={form.datenschutz}
                onCheckedChange={(c) => set("datenschutz", c === true)}
              />
              <span className="text-sm leading-snug">
                Ich habe die <a href="#datenschutz" className="underline">Datenschutzerklärung</a> gelesen und stimme der Verarbeitung meiner Daten zu. <span className="text-red-500">*</span>
              </span>
            </label>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {loading ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Wird gesendet…</> : "Bewerbung absenden"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  id: string; label: string; value: string;
  onChange: (v: string) => void;
  type?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>
        {props.label} {props.required && <span className="text-red-500">*</span>}
      </Label>
      <Input
        id={props.id}
        type={props.type || "text"}
        required={props.required}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="rounded-full h-11"
      />
    </div>
  );
}

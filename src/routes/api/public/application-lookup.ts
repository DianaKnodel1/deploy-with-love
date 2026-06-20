// Public lookup: Bewerber gibt seine E-Mail ein → wir prüfen, ob es eine
// Bewerbung gibt und wenn ja, geben wir die passende Calendly-/Verbinden-URL
// zurück, damit er seinen Termin nachbuchen kann.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const Schema = z.object({
  email: z.string().trim().email().max(255),
  portal_url: z.string().url().max(500).optional().nullable(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/application-lookup")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: unknown;
        try { payload = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
        const parsed = Schema.safeParse(payload);
        if (!parsed.success) return json({ error: "Validation failed" }, 400);

        const email = parsed.data.email.toLowerCase();

        // Neueste Bewerbung zu dieser E-Mail
        const { data: apps, error } = await supabaseAdmin
          .from("applications")
          .select("id, full_name, email, phone, source_slug, booking_status, tenant_id, created_at")
          .ilike("email", email)
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) {
          console.error("[application-lookup]", error);
          return json({ error: "Lookup failed" }, 500);
        }
        const app = (apps ?? [])[0] as any;
        if (!app) {
          return json({ found: false, message: "Zu dieser E-Mail liegt uns keine Bewerbung vor." });
        }

        // Landing-Info holen, um zu prüfen ob Calendly verfügbar ist
        let calendlyUrl: string | null = null;
        let landingSlug: string | null = app.source_slug ?? null;
        if (landingSlug) {
          const { data: lp } = await supabaseAdmin
            .from("landing_pages")
            .select("calendly_url, slug")
            .eq("source_slug", landingSlug)
            .eq("is_published", true)
            .maybeSingle();
          calendlyUrl = (lp as any)?.calendly_url ?? null;
          landingSlug = (lp as any)?.slug ?? landingSlug;
        }

        const booked = app.booking_status === "booked";
        if (booked) {
          return json({
            found: true,
            booked: true,
            message: "Für deine Bewerbung ist bereits ein Termin gebucht. Du erhältst die Bestätigung per E-Mail.",
          });
        }

        if (!calendlyUrl || !landingSlug) {
          return json({
            found: true,
            booked: false,
            message: "Wir haben deine Bewerbung erhalten. Bitte warte auf unsere Rückmeldung per E-Mail.",
          });
        }

        // Redirect-URL zur Verbinden-Seite bauen
        const base = (parsed.data.portal_url || new URL(request.url).origin).replace(/\/+$/, "");
        const parts = String(app.full_name || "").trim().split(/\s+/);
        const firstName = parts[0] ?? "";
        const lastName = parts.slice(1).join(" ");
        const qs = new URLSearchParams({
          app: app.id,
          landing: landingSlug,
          first_name: firstName,
          last_name: lastName,
          email: app.email,
          phone: app.phone ?? "",
        }).toString();
        return json({
          found: true,
          booked: false,
          redirect_url: `${base}/bewerbung/verbinden?${qs}`,
        });
      },
    },
  },
});

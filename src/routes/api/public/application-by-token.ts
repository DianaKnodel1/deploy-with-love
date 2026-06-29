// Public endpoint: Magic-Token → Application-Lookup.
// Wird von /bewerbung?token=... aufgerufen, um nach einer Calendly-Buchung
// den Bewerber direkt ins KI-Interview zu leiten.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const Schema = z.object({ token: z.string().trim().min(8).max(128) });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/application-by-token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: unknown;
        try { payload = await request.json(); } catch {
          return json({ ok: false, error: "Invalid JSON" }, 400);
        }
        const parsed = Schema.safeParse(payload);
        if (!parsed.success) return json({ ok: false, error: "Invalid token" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any).rpc(
          "get_application_by_magic_token",
          { _token: parsed.data.token },
        );
        if (error) {
          console.error("[application-by-token] rpc error:", error);
          return json({ ok: false, error: "Server error" }, 500);
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return json({ ok: false, error: "not_found" }, 404);

        return json({
          ok: true,
          application_id: row.application_id,
          tenant_id: row.tenant_id,
          status: row.status,
          full_name: row.full_name,
        });
      },
    },
  },
});

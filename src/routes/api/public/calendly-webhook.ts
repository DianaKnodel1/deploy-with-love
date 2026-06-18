// Public webhook endpoint für Calendly.
// Calendly-Doku: https://developer.calendly.com/api-docs/ZG9jOjE0ODcyMDMx-webhook-signatures
//
// Header "Calendly-Webhook-Signature": "t=<timestamp>,v1=<hex-sig>"
// Signature = HMAC-SHA256(signing_key, `${t}.${raw_body}`).
//
// Wir akzeptieren jede Signatur, die mit IRGENDEINEM der hinterlegten
// webhook_signing_keys aus calendly_accounts matched (mehrere CF/Calendly
// Accounts pro Workspace sind möglich).

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function parseSignatureHeader(h: string | null): { t: string; v1: string } | null {
  if (!h) return null;
  const parts = Object.fromEntries(
    h.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  if (!parts.t || !parts.v1) return null;
  return { t: parts.t, v1: parts.v1 };
}

function verify(rawBody: string, t: string, sig: string, key: string): boolean {
  const expected = createHmac("sha256", key).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export const Route = createFileRoute("/api/public/calendly-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const sigHeader = parseSignatureHeader(request.headers.get("calendly-webhook-signature"));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: accounts } = await supabaseAdmin
          .from("calendly_accounts")
          .select("id, tenant_id, webhook_signing_key");

        let matched = false;
        if (sigHeader) {
          for (const acc of accounts ?? []) {
            if (verify(rawBody, sigHeader.t, sigHeader.v1, (acc as any).webhook_signing_key)) {
              matched = true;
              break;
            }
          }
        }
        if (!matched) {
          await supabaseAdmin.from("automation_log").insert({
            action: "calendly.webhook.invalid_signature",
            status: "warn",
            target: null,
            error: "Signature did not match any account",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try { payload = JSON.parse(rawBody); } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const event = payload?.event as string | undefined;
        const inv = payload?.payload ?? {};
        const eventUri = inv?.uri ?? inv?.event ?? null;
        const inviteeUri = inv?.uri ?? null;
        const email = String(inv?.email ?? "").toLowerCase();
        const startTime = inv?.scheduled_event?.start_time ?? null;
        // utm_content from prefill carries our application_id
        const tracking = inv?.tracking ?? {};
        const appIdFromUtm = tracking?.utm_content || tracking?.salesforce_uuid || null;

        // Find matching application
        let appRow: any = null;
        if (appIdFromUtm) {
          const { data } = await supabaseAdmin
            .from("applications")
            .select("id, tenant_id, email")
            .eq("id", appIdFromUtm).maybeSingle();
          if (data) appRow = data;
        }
        if (!appRow && email) {
          const { data } = await supabaseAdmin
            .from("applications")
            .select("id, tenant_id, email, booking_status, created_at")
            .eq("email", email)
            .order("created_at", { ascending: false })
            .limit(1).maybeSingle();
          if (data) appRow = data;
        }

        if (!appRow) {
          await supabaseAdmin.from("automation_log").insert({
            action: `calendly.${event ?? "unknown"}.no_match`,
            status: "warn",
            target: email || null,
            payload: { eventUri, email },
          });
          return Response.json({ ok: true, matched: false });
        }

        let newStatus: string | null = null;
        if (event === "invitee.created") newStatus = "scheduled";
        else if (event === "invitee.canceled") newStatus = "cancelled";
        else if (event === "invitee_no_show.created") newStatus = "no_show";

        if (newStatus) {
          await supabaseAdmin.from("applications").update({
            booking_status: newStatus,
            scheduled_at: startTime ?? null,
            calendly_event_uri: eventUri ?? null,
            calendly_invitee_uri: inviteeUri ?? null,
          }).eq("id", appRow.id);
        }

        await supabaseAdmin.from("automation_log").insert({
          action: `calendly.${event ?? "unknown"}`,
          status: "ok",
          target: appRow.email ?? email,
          payload: { application_id: appRow.id, scheduled_at: startTime, status: newStatus },
        });

        return Response.json({ ok: true, application_id: appRow.id, status: newStatus });
      },
    },
  },
});

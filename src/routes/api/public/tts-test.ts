import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tts-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text, voice } = (await request.json()) as {
          text: string;
          voice?: string;
        };
        if (!text || typeof text !== "string") {
          return new Response("text required", { status: 400 });
        }
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response("LOVABLE_API_KEY missing", { status: 500 });
        }
        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/audio/speech",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: text.slice(0, 4000),
              voice: voice || "alloy",
              response_format: "mp3",
            }),
          },
        );
        if (!upstream.ok) {
          const err = await upstream.text().catch(() => "");
          return new Response(err || "tts failed", { status: upstream.status });
        }
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});

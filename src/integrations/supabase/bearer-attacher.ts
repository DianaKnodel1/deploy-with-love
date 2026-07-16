// Robust Bearer-Attacher für serverFn Aufrufe.
// Ersetzt die auto-generierte attachSupabaseAuth: refresht den Token,
// wenn er abgelaufen ist (oder <60s vor Ablauf), bevor er attached wird.
// Verhindert "Unauthorized: Invalid token" nach längeren Sessions / Deploys.
import { createMiddleware } from '@tanstack/react-start';
import { supabase } from './client';

async function getFreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return null;

    const expiresAt = session.expires_at ?? 0; // unix seconds
    const nowSec = Math.floor(Date.now() / 1000);

    // Wenn Token in <60s abläuft oder schon abgelaufen: refresh erzwingen.
    if (expiresAt - nowSec < 60) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error || !refreshed.session) {
        // Refresh fehlgeschlagen → alten Token trotzdem versuchen; Server wird
        // 401 werfen und der Client zeigt eine sinnvolle Meldung.
        return session.access_token ?? null;
      }
      return refreshed.session.access_token;
    }

    return session.access_token;
  } catch {
    return null;
  }
}

export const attachSupabaseBearer = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    const token = await getFreshAccessToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);

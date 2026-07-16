// Robust Bearer-Attacher für serverFn-Aufrufe.
// Wichtig: NICHT zusätzlich den generierten attachSupabaseAuth registrieren.
// Dieser Attacher wartet kurz auf die Session-Hydration, refresht den Token
// regelmäßig vor geschützten Calls und hängt nie bewusst einen abgelaufenen
// Token an. Das verhindert "Unauthorized: Invalid token" nach Deploy/Idle.
import { createMiddleware } from '@tanstack/react-start';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './client';

const REFRESH_EVERY_MS = 30_000;
const SESSION_WAIT_MS = 1_500;

let lastRefreshAt = 0;
let refreshInFlight: Promise<string | null> | null = null;

function isBrowser() {
  return typeof window !== 'undefined';
}

function isJwtLike(token: string | null | undefined): token is string {
  return typeof token === 'string' && token.split('.').length === 3;
}

async function waitForStoredSession() {
  const first = await supabase.auth.getSession();
  if (first.data.session) return first.data.session;

  if (!isBrowser()) return null;

  return await new Promise<Session | null>((resolve) => {
    let done = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const finish = (session: typeof first.data.session) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(session ?? null);
    };

    const timer = window.setTimeout(() => finish(null), SESSION_WAIT_MS);

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        finish(session);
      }
    });
    subscription = data.subscription;
  });
}

async function getFreshAccessToken(): Promise<string | null> {
  try {
    const session = await waitForStoredSession();
    if (!session) return null;

    const expiresAt = session.expires_at ?? 0; // unix seconds
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresSoon = expiresAt > 0 && expiresAt - nowSec < 300;
    const shouldRefresh = expiresSoon || Date.now() - lastRefreshAt > REFRESH_EVERY_MS;

    if (shouldRefresh) {
      refreshInFlight ??= supabase.auth.refreshSession()
        .then(({ data, error }) => {
          if (error || !data.session?.access_token) return null;
          lastRefreshAt = Date.now();
          return data.session.access_token;
        })
        .finally(() => {
          refreshInFlight = null;
        });

      const refreshedToken = await refreshInFlight;
      if (isJwtLike(refreshedToken)) return refreshedToken;

      // Abgelaufene Tokens nie mehr mitschicken – das erzeugt serverseitig
      // genau den störenden "Invalid token"-Fehler. Der Nutzer muss sich dann
      // sauber neu anmelden statt mit kaputter Session weiterzulaufen.
      if (expiresAt > 0 && expiresAt <= nowSec) return null;
    }

    return isJwtLike(session.access_token) ? session.access_token : null;
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

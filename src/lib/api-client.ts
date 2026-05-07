import { Aeriox } from '@aeriox-co/api';
import { getSession, setSession } from './auth/keychain.js';
import { refreshToken as refreshOauthToken } from './auth/loopback-pkce.js';

export function resolveBaseUrl(): string {
  return process.env.AERIOX_BASE_URL?.trim() || 'https://api.aeriox.co';
}

const SKEW_SECONDS = 60;

async function refreshIfExpired(account: string): Promise<string | undefined> {
  const session = await getSession(account);
  if (!session) return undefined;
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at - SKEW_SECONDS > now) return session.access_token;
  if (!session.refresh_token) return session.access_token;
  try {
    const fresh = await refreshOauthToken({
      baseUrl: session.base_url ?? resolveBaseUrl(),
      clientId: 'aeriox-cli',
      refresh_token: session.refresh_token,
    });
    const updated = {
      ...session,
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token ?? session.refresh_token,
      expires_at: now + fresh.expires_in,
    };
    await setSession(account, updated);
    return fresh.access_token;
  } catch {
    return session.access_token;
  }
}

export async function getClient(workspace = 'default'): Promise<Aeriox> {
  const apiKey = process.env.AERIOX_API_KEY;
  if (apiKey) {
    return new Aeriox({
      security: { apiKey },
      serverURL: resolveBaseUrl(),
    });
  }
  const token = await refreshIfExpired(workspace);
  if (!token) {
    throw new Error('Not logged in. Run `aeriox login` first, or set AERIOX_API_KEY.');
  }
  const session = await getSession(workspace);
  return new Aeriox({
    security: { apiKey: token },
    serverURL: session?.base_url ?? resolveBaseUrl(),
  });
}

/**
 * Returns the Authorization-style bearer for raw fetch calls (for endpoints
 * not yet covered by the SDK). Equivalent resolution to getClient(): env first,
 * then keychain. Throws on neither.
 */
export async function getBearer(workspace = 'default'): Promise<{ token: string; baseUrl: string }> {
  const env = process.env.AERIOX_API_KEY;
  if (env) return { token: env, baseUrl: resolveBaseUrl() };
  const token = await refreshIfExpired(workspace);
  if (!token) {
    throw new Error('Not logged in. Run `aeriox login` first, or set AERIOX_API_KEY.');
  }
  const session = await getSession(workspace);
  return { token, baseUrl: session?.base_url ?? resolveBaseUrl() };
}

import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import open from 'open';

export interface LoginOptions {
  baseUrl: string;
  clientId: string;
  scopes: string[];
  noBrowser?: boolean;
  timeoutMs?: number;
}

export interface PkceFlowResult {
  code: string;
  state: string;
  redirect_uri: string;
  verifier: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type?: string;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generatePkcePair(verifier?: Buffer): { verifier: string; challenge: string } {
  const v = base64url(verifier ?? randomBytes(32));
  const c = base64url(createHash('sha256').update(v).digest());
  return { verifier: v, challenge: c };
}

export function runPkceFlow(opts: LoginOptions): Promise<PkceFlowResult> {
  const { verifier, challenge } = generatePkcePair();
  const state = base64url(randomBytes(16));

  return new Promise<PkceFlowResult>((resolve, reject) => {
    let resolved = false;

    const server = createServer((req, res) => {
      try {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
        if (reqUrl.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }
        const code = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        const error = reqUrl.searchParams.get('error');
        if (error) {
          res.writeHead(400, { 'content-type': 'text/html' }).end(
            `<h1>Login failed</h1><p>${error}</p>`,
          );
          if (!resolved) {
            resolved = true;
            server.close();
            reject(new Error(`OAuth error: ${error}`));
          }
          return;
        }
        if (!code || returnedState !== state) {
          res.writeHead(400, { 'content-type': 'text/html' }).end('<h1>Invalid callback</h1>');
          if (!resolved) {
            resolved = true;
            server.close();
            reject(new Error('Invalid OAuth callback (missing code or state mismatch)'));
          }
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html' }).end(
          '<h1>You can close this tab.</h1><p>The CLI captured the code and is exchanging it for a token.</p>',
        );
        if (!resolved) {
          resolved = true;
          server.close();
          resolve({
            code,
            state,
            redirect_uri: `http://127.0.0.1:${port}/callback`,
            verifier,
          });
        }
      } catch (err) {
        if (!resolved) {
          resolved = true;
          server.close();
          reject(err as Error);
        }
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const redirect = `http://127.0.0.1:${port}/callback`;
      const authUrl = new URL(`${opts.baseUrl}/v1/oauth/authorize`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', opts.clientId);
      authUrl.searchParams.set('redirect_uri', redirect);
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('scope', opts.scopes.join(' '));
      authUrl.searchParams.set('state', state);
      const url = authUrl.toString();
      if (opts.noBrowser) {
        process.stderr.write(`Open this URL: ${url}\n`);
      } else {
        open(url).catch(() => {
          process.stderr.write(`Open this URL: ${url}\n`);
        });
      }
    });

    const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server.close();
        reject(new Error('PKCE login timeout'));
      }
    }, timeoutMs);
    timer.unref?.();
  });
}

export async function exchangeCode(opts: {
  baseUrl: string;
  clientId: string;
  code: string;
  verifier: string;
  redirect_uri: string;
}): Promise<TokenResponse> {
  const res = await fetch(`${opts.baseUrl}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirect_uri,
      code_verifier: opts.verifier,
      client_id: opts.clientId,
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function refreshToken(opts: {
  baseUrl: string;
  clientId: string;
  refresh_token: string;
}): Promise<TokenResponse> {
  const res = await fetch(`${opts.baseUrl}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: opts.refresh_token,
      client_id: opts.clientId,
    }),
  });
  if (!res.ok) {
    throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function revokeToken(opts: {
  baseUrl: string;
  clientId: string;
  token: string;
}): Promise<void> {
  await fetch(`${opts.baseUrl}/v1/oauth/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: opts.token, client_id: opts.clientId }),
  });
}

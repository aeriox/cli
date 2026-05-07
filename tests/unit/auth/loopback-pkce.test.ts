import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('open', () => ({ default: vi.fn(() => Promise.resolve()) }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PKCE pair generation', () => {
  it('generates a code_challenge that is the SHA256 of code_verifier (base64url)', async () => {
    const { generatePkcePair } = await import('../../../src/lib/auth/loopback-pkce.js');
    const { verifier, challenge } = generatePkcePair();
    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challenge).toBe(expected);
    // verifier ought to be at least 43 chars per RFC 7636
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe('runPkceFlow', () => {
  it('resolves with a code when the loopback server receives a valid callback', async () => {
    const open = (await import('open')).default as ReturnType<typeof vi.fn>;
    let capturedAuthUrl = '';
    open.mockImplementation((url: string) => {
      capturedAuthUrl = url;
      // Hit the callback once we know the redirect_uri.
      const u = new URL(url);
      const redirect = u.searchParams.get('redirect_uri');
      const state = u.searchParams.get('state');
      // Schedule a fetch to the redirect URL after a tick.
      setImmediate(() => {
        fetch(`${redirect}?code=test_code_value&state=${state}`).catch(() => {
          // ignore — server closes immediately on success
        });
      });
      return Promise.resolve();
    });

    const { runPkceFlow } = await import('../../../src/lib/auth/loopback-pkce.js');
    const result = await runPkceFlow({
      baseUrl: 'https://example.test',
      clientId: 'aeriox-cli',
      scopes: ['read'],
      timeoutMs: 5000,
    });
    expect(result.code).toBe('test_code_value');
    expect(result.verifier.length).toBeGreaterThanOrEqual(43);
    expect(capturedAuthUrl).toContain('https://example.test/v1/oauth/authorize');
    expect(capturedAuthUrl).toContain('code_challenge_method=S256');
  });

  it('rejects when state does not match', async () => {
    const open = (await import('open')).default as ReturnType<typeof vi.fn>;
    open.mockImplementation((url: string) => {
      const u = new URL(url);
      const redirect = u.searchParams.get('redirect_uri');
      setImmediate(() => {
        fetch(`${redirect}?code=x&state=WRONG_STATE`).catch(() => {});
      });
      return Promise.resolve();
    });

    const { runPkceFlow } = await import('../../../src/lib/auth/loopback-pkce.js');
    await expect(
      runPkceFlow({
        baseUrl: 'https://example.test',
        clientId: 'aeriox-cli',
        scopes: ['read'],
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/state mismatch/);
  });

  it('rejects when the authorization server returns ?error=', async () => {
    const open = (await import('open')).default as ReturnType<typeof vi.fn>;
    open.mockImplementation((url: string) => {
      const u = new URL(url);
      const redirect = u.searchParams.get('redirect_uri');
      setImmediate(() => {
        fetch(`${redirect}?error=access_denied`).catch(() => {});
      });
      return Promise.resolve();
    });

    const { runPkceFlow } = await import('../../../src/lib/auth/loopback-pkce.js');
    await expect(
      runPkceFlow({
        baseUrl: 'https://example.test',
        clientId: 'aeriox-cli',
        scopes: ['read'],
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/access_denied/);
  });
});

describe('exchangeCode', () => {
  it('POSTs form-encoded body to /v1/oauth/token and returns parsed JSON', async () => {
    const fakeFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: 'AT',
          refresh_token: 'RT',
          expires_in: 3600,
          scope: 'read generate',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fakeFetch);
    const { exchangeCode } = await import('../../../src/lib/auth/loopback-pkce.js');
    const out = await exchangeCode({
      baseUrl: 'https://example.test',
      clientId: 'aeriox-cli',
      code: 'C',
      verifier: 'V',
      redirect_uri: 'http://127.0.0.1:1234/callback',
    });
    expect(out.access_token).toBe('AT');
    expect(fakeFetch).toHaveBeenCalledOnce();
    const args = fakeFetch.mock.calls[0]!;
    expect(args[0]).toBe('https://example.test/v1/oauth/token');
    expect(((args[1] as RequestInit).body as URLSearchParams).get('grant_type')).toBe(
      'authorization_code',
    );
  });
});

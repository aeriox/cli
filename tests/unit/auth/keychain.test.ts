import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const FALLBACK_FILE = path.join(os.homedir(), '.config', 'aeriox', 'session.json');

const memoryStore = new Map<string, string>();

vi.mock('@napi-rs/keyring', () => {
  return {
    Entry: class {
      constructor(public service: string, public account: string) {}
      key(): string {
        return `${this.service}:${this.account}`;
      }
      getPassword(): string | null {
        return memoryStore.get(this.key()) ?? null;
      }
      setPassword(v: string): void {
        memoryStore.set(this.key(), v);
      }
      deletePassword(): boolean {
        return memoryStore.delete(this.key());
      }
    },
  };
});

describe('keychain', () => {
  let originalIsTTY: boolean | undefined;
  let originalNoKeychain: string | undefined;
  let originalHome: string | undefined;
  let tmpHome: string;

  beforeEach(async () => {
    memoryStore.clear();
    originalIsTTY = process.stdout.isTTY;
    originalNoKeychain = process.env.AERIOX_NO_KEYCHAIN;
    originalHome = process.env.HOME;
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aeriox-test-'));
    process.env.HOME = tmpHome;
    // Force a fresh module so os.homedir() is reread.
    vi.resetModules();
  });

  afterEach(async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    if (originalNoKeychain === undefined) {
      delete process.env.AERIOX_NO_KEYCHAIN;
    } else {
      process.env.AERIOX_NO_KEYCHAIN = originalNoKeychain;
    }
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    try {
      await fs.rm(tmpHome, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('uses napi-rs keyring when TTY and no env override', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    delete process.env.AERIOX_NO_KEYCHAIN;
    const { setSession, getSession } = await import('../../../src/lib/auth/keychain.js');
    const session = { access_token: 'a', expires_at: 0, workspace_id: 'w' };
    const backend = await setSession('default', session);
    expect(backend).toBe('napi-rs');
    const back = await getSession('default');
    expect(back).toEqual(session);
  });

  it('falls back to file when AERIOX_NO_KEYCHAIN=1', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    process.env.AERIOX_NO_KEYCHAIN = '1';
    const { setSession, getSession } = await import('../../../src/lib/auth/keychain.js');
    const session = { access_token: 'a', expires_at: 0, workspace_id: 'w' };
    const backend = await setSession('default', session);
    expect(backend).toBe('file');
    const fileContents = JSON.parse(
      await fs.readFile(path.join(tmpHome, '.config', 'aeriox', 'session.json'), 'utf8'),
    );
    expect(fileContents.default).toEqual(session);
    const back = await getSession('default');
    expect(back).toEqual(session);
  });

  it('does NOT auto-fall-back when stdout is not a TTY (opt-in only)', async () => {
    // Previously a non-TTY stdout silently triggered file fallback.
    // That auto-detection is removed: non-TTY callers must explicitly
    // set AERIOX_NO_KEYCHAIN=1 to acknowledge plaintext disk storage.
    // With AERIOX_NO_KEYCHAIN unset and the keyring loading fine, the
    // keychain path is taken regardless of TTY.
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    delete process.env.AERIOX_NO_KEYCHAIN;
    const { setSession } = await import('../../../src/lib/auth/keychain.js');
    const session = { access_token: 'a', expires_at: 0, workspace_id: 'w' };
    const backend = await setSession('default', session);
    expect(backend).toBe('napi-rs');
  });

  it('uses file fallback when AERIOX_NO_KEYCHAIN=1 even with TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    process.env.AERIOX_NO_KEYCHAIN = '1';
    const { setSession } = await import('../../../src/lib/auth/keychain.js');
    const session = { access_token: 'a', expires_at: 0, workspace_id: 'w' };
    const backend = await setSession('default', session);
    expect(backend).toBe('file');
  });

  it('throws when keyring throws and AERIOX_NO_KEYCHAIN is unset (no implicit file fallback)', async () => {
    // Even in a TTY, if the napi-rs keyring throws, the function MUST
    // throw rather than silently writing tokens to disk. The error
    // message recommends setting AERIOX_NO_KEYCHAIN=1 to opt in.
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    delete process.env.AERIOX_NO_KEYCHAIN;
    vi.resetModules();
    vi.doMock('@napi-rs/keyring', () => {
      return {
        Entry: class {
          constructor(public service: string, public account: string) {}
          getPassword(): string | null {
            throw new Error('keyring unavailable');
          }
          setPassword(_v: string): void {
            throw new Error('keyring unavailable');
          }
          deletePassword(): boolean {
            throw new Error('keyring unavailable');
          }
        },
      };
    });
    const { setSession } = await import('../../../src/lib/auth/keychain.js');
    await expect(
      setSession('default', { access_token: 'x', expires_at: 0, workspace_id: 'w' }),
    ).rejects.toThrow(/Keychain write failed/);
    vi.doUnmock('@napi-rs/keyring');
  });

  it('uses correct fallback path', async () => {
    expect(FALLBACK_FILE).toContain('.config/aeriox/session.json');
  });
});

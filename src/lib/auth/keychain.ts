import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SERVICE = 'aeriox';

export interface Session {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  workspace_id: string;
  scopes?: string[];
  base_url?: string;
}

export type Backend = 'napi-rs' | 'file';

const FALLBACK_DIR = path.join(os.homedir(), '.config', 'aeriox');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'session.json');

// File fallback is opt-in only. Previously this auto-fell-back when
// stdout was not a TTY, but that meant any non-TTY context (CI, pipes,
// systemd, sshd-spawned shell) silently wrote tokens to disk in
// plaintext. Non-TTY callers must now explicitly set
// AERIOX_NO_KEYCHAIN=1 to acknowledge the downgrade; otherwise a
// keychain failure throws clearly.
function shouldUseFile(): boolean {
  return process.env.AERIOX_NO_KEYCHAIN === '1';
}

function warnDegraded(): void {
  process.stderr.write('[degraded mode] storing tokens at ~/.config/aeriox/session.json\n');
}

async function loadEntries(): Promise<Record<string, Session>> {
  try {
    const raw = await fs.readFile(FALLBACK_FILE, 'utf8');
    return JSON.parse(raw) as Record<string, Session>;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeEntries(entries: Record<string, Session>): Promise<void> {
  await fs.mkdir(FALLBACK_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(FALLBACK_FILE, JSON.stringify(entries, null, 2), { mode: 0o600 });
  // Re-chmod in case file already existed with different mode.
  await fs.chmod(FALLBACK_FILE, 0o600);
}

async function loadKeyring(): Promise<{ Entry: new (service: string, account: string) => { getPassword(): string | null; setPassword(v: string): void; deletePassword(): boolean } } | null> {
  try {
    const mod = await import('@napi-rs/keyring');
    return mod as unknown as { Entry: new (service: string, account: string) => { getPassword(): string | null; setPassword(v: string): void; deletePassword(): boolean } };
  } catch {
    return null;
  }
}

export async function setSession(account: string, session: Session): Promise<Backend> {
  if (shouldUseFile()) {
    warnDegraded();
    const entries = await loadEntries();
    entries[account] = session;
    await writeEntries(entries);
    return 'file';
  }

  const keyring = await loadKeyring();
  if (!keyring) {
    throw new Error('Keychain unavailable: @napi-rs/keyring failed to load. Set AERIOX_NO_KEYCHAIN=1 to opt in to the ~/.config/aeriox/session.json file fallback (required for CI/headless contexts).');
  }
  try {
    const entry = new keyring.Entry(SERVICE, account);
    entry.setPassword(JSON.stringify(session));
    return 'napi-rs';
  } catch (err) {
    throw new Error(`Keychain write failed: ${(err as Error).message}`);
  }
}

export async function getSession(account: string): Promise<Session | null> {
  if (shouldUseFile()) {
    warnDegraded();
    const entries = await loadEntries();
    return entries[account] ?? null;
  }

  const keyring = await loadKeyring();
  if (!keyring) {
    throw new Error('Keychain unavailable: @napi-rs/keyring failed to load. Set AERIOX_NO_KEYCHAIN=1 to opt in to the ~/.config/aeriox/session.json file fallback (required for CI/headless contexts).');
  }
  try {
    const entry = new keyring.Entry(SERVICE, account);
    const raw = entry.getPassword();
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch (err) {
    throw new Error(`Keychain read failed: ${(err as Error).message}`);
  }
}

export async function deleteSession(account: string): Promise<void> {
  if (shouldUseFile()) {
    warnDegraded();
    const entries = await loadEntries();
    delete entries[account];
    await writeEntries(entries);
    return;
  }

  const keyring = await loadKeyring();
  if (!keyring) {
    throw new Error('Keychain unavailable: @napi-rs/keyring failed to load. Set AERIOX_NO_KEYCHAIN=1 to opt in to the ~/.config/aeriox/session.json file fallback (required for CI/headless contexts).');
  }
  try {
    const entry = new keyring.Entry(SERVICE, account);
    entry.deletePassword();
  } catch {
    // ignore — deleting an absent entry is fine
  }
}

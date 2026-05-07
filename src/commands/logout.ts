import { Command, Flags } from '@oclif/core';
import { deleteSession, getSession } from '../lib/auth/keychain.js';
import { revokeToken } from '../lib/auth/loopback-pkce.js';
import { resolveBaseUrl } from '../lib/api-client.js';
import { printError } from '../lib/output/format.js';

export default class Logout extends Command {
  static override description = 'Clear the stored AERIOX session and revoke the refresh token.';

  static override flags = {
    workspace: Flags.string({ char: 'w', description: 'Workspace ID for multi-workspace users' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    json: Flags.boolean({ description: 'Output JSON' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(Logout);
    const account = flags.workspace ?? 'default';
    try {
      const session = await getSession(account);
      if (session?.refresh_token) {
        await revokeToken({
          baseUrl: session.base_url ?? resolveBaseUrl(),
          clientId: 'aeriox-cli',
          token: session.refresh_token,
        }).catch(() => {
          // best-effort; we still drop the local copy
        });
      }
      await deleteSession(account);
      if (flags.json) {
        process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      } else if (!flags.quiet) {
        this.log('Logged out.');
      }
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

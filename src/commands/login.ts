import { Command, Flags } from '@oclif/core';
import { runPkceFlow, exchangeCode } from '../lib/auth/loopback-pkce.js';
import { setSession } from '../lib/auth/keychain.js';
import { resolveBaseUrl } from '../lib/api-client.js';
import { printError, printJson } from '../lib/output/format.js';

export default class Login extends Command {
  static override description = 'Authenticate with AERIOX via OAuth (browser-based PKCE).';

  static override flags = {
    workspace: Flags.string({ char: 'w', description: 'Workspace ID for multi-workspace users' }),
    scope: Flags.string({ description: 'Comma-separated scopes', default: 'read,generate,offline_access' }),
    'no-browser': Flags.boolean({ description: 'Print URL instead of opening a browser' }),
    'base-url': Flags.string({ description: 'Override the API base URL' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(Login);
    const baseUrl = flags['base-url']?.trim() || resolveBaseUrl();
    try {
      const result = await runPkceFlow({
        baseUrl,
        clientId: 'aeriox-cli',
        scopes: flags.scope.split(','),
        noBrowser: flags['no-browser'],
      });
      const tokens = await exchangeCode({
        baseUrl,
        clientId: 'aeriox-cli',
        code: result.code,
        verifier: result.verifier,
        redirect_uri: result.redirect_uri,
      });
      const claims = decodeJwtClaims(tokens.access_token);
      const workspaceId = (claims.workspace_id as string | undefined) ?? (claims.sub as string | undefined) ?? 'unknown';
      const account = flags.workspace ?? 'default';
      await setSession(account, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
        workspace_id: workspaceId,
        scopes: tokens.scope?.split(' '),
        base_url: baseUrl,
      });
      if (flags.json) {
        printJson({ workspace_id: workspaceId, base_url: baseUrl, scopes: tokens.scope?.split(' ') ?? [] }, { quiet: flags.quiet });
      } else if (!flags.quiet) {
        this.log(`Logged in as workspace ${workspaceId}`);
      }
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

function decodeJwtClaims(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length < 2) return {};
  try {
    const payload = parts[1]!;
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

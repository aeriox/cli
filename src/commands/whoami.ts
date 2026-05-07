import { Command, Flags } from '@oclif/core';
import { getClient } from '../lib/api-client.js';
import { printError, printJson, printTable } from '../lib/output/format.js';

export default class Whoami extends Command {
  static override description = 'Show the currently authenticated workspace and balance.';

  static override flags = {
    workspace: Flags.string({ char: 'w', description: 'Workspace ID for multi-workspace users' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(Whoami);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const me = await client.apiKeys.getMe();
      const wallet = await client.wallet.getWallet().catch(() => undefined);
      const data = {
        workspace_id: (me as Record<string, unknown>).workspace_id ?? (me as Record<string, unknown>).workspaceId ?? null,
        api_key_prefix: (me as Record<string, unknown>).api_key_prefix ?? null,
        balance_usd: wallet ? (wallet as Record<string, unknown>).balance_usd ?? (wallet as Record<string, unknown>).balanceUsd ?? null : null,
      };
      if (flags.json) {
        printJson(data, { quiet: flags.quiet });
      } else {
        printTable(
          [data],
          [
            { header: 'workspace', get: (r) => String(r.workspace_id ?? '') },
            { header: 'api_key', get: (r) => String(r.api_key_prefix ?? '') },
            { header: 'balance_usd', get: (r) => String(r.balance_usd ?? '') },
          ],
          { quiet: flags.quiet },
        );
      }
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

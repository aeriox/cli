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
      const me = (await client.apiKeys.getMe()) as {
        workspace?: { id?: string; name?: string; plan?: string };
        apiKey?: { prefix?: string; scopes?: string[] };
      };
      const wallet = (await client.wallet.getWallet().catch(() => undefined)) as
        | { balance?: { balance_usd?: number; balanceUsd?: number } }
        | undefined;
      // SDK remaps `api_key` → `apiKey`. Read from the nested shape; the
      // ad-hoc `workspace_id` flat field never existed on the wire.
      const balanceObj = (wallet?.balance ?? {}) as Record<string, unknown>;
      const balanceUsd =
        (typeof balanceObj.balance_usd === 'number' ? balanceObj.balance_usd : undefined) ??
        (typeof balanceObj.balanceUsd === 'number' ? balanceObj.balanceUsd : undefined) ??
        null;
      const data = {
        workspace_id: me.workspace?.id ?? null,
        workspace_name: me.workspace?.name ?? null,
        plan: me.workspace?.plan ?? null,
        api_key_prefix: me.apiKey?.prefix ?? null,
        scopes: me.apiKey?.scopes ?? [],
        balance_usd: balanceUsd,
      };
      if (flags.json) {
        printJson(data, { quiet: flags.quiet });
      } else {
        printTable(
          [data],
          [
            { header: 'workspace', get: (r) => String(r.workspace_id ?? '') },
            { header: 'name', get: (r) => String(r.workspace_name ?? '') },
            { header: 'plan', get: (r) => String(r.plan ?? '') },
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

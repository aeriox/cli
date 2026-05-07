import { Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { printError, printJson, printTable } from '../../lib/output/format.js';

export default class WalletHistory extends Command {
  static override description = 'Show recent wallet transactions.';

  static override flags = {
    limit: Flags.integer({ description: 'Max rows', default: 50 }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(WalletHistory);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const wallet = await client.wallet.getWallet({ limit: flags.limit });
      if (flags.json) {
        printJson(wallet, { quiet: flags.quiet });
        return;
      }
      const txs = ((wallet as Record<string, unknown>).recentTransactions as Array<Record<string, unknown>> | undefined)
        ?? ((wallet as Record<string, unknown>).recent_transactions as Array<Record<string, unknown>> | undefined)
        ?? [];
      printTable(txs, [
        { header: 'created_at', get: (r) => String(r.createdAt ?? r.created_at ?? '') },
        { header: 'kind', get: (r) => String(r.kind ?? r.type ?? '') },
        { header: 'amount_usd', get: (r) => String(r.amountUsd ?? r.amount_usd ?? '') },
        { header: 'description', get: (r) => String(r.description ?? r.note ?? '') },
      ], { quiet: flags.quiet });
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

import { Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { printError, printJson } from '../../lib/output/format.js';

export default class WalletBalance extends Command {
  static override description = 'Show the workspace wallet balance.';

  static override flags = {
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(WalletBalance);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const wallet = await client.wallet.getWallet();
      if (flags.json) {
        printJson(wallet, { quiet: flags.quiet });
        return;
      }
      const balance = (wallet as Record<string, unknown>).balance as Record<string, unknown> | undefined;
      const usd = balance?.usd ?? balance?.balanceUsd ?? balance?.balance_usd;
      if (!flags.quiet) this.log(`balance: $${String(usd ?? 'unknown')}`);
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

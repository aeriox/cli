import { Args, Command, Flags } from '@oclif/core';
import open from 'open';
import { getClient, resolveBaseUrl } from '../../lib/api-client.js';
import { printError, printJson } from '../../lib/output/format.js';

export default class WalletTopup extends Command {
  static override description = 'Top up the wallet balance via a Stripe PaymentIntent.';

  static override args = {
    amount: Args.string({ description: 'Amount in USD (e.g. 25)', required: true }),
  };

  static override flags = {
    'payment-method': Flags.string({ description: 'Saved Stripe payment method id (off-session)' }),
    'no-browser': Flags.boolean({ description: 'Print the dashboard URL instead of opening a browser' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(WalletTopup);
    try {
      const amount = Number(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number.');
      }
      const client = await getClient(flags.workspace ?? 'default');
      const intent = await client.wallet.topUpWallet({
        amountUsd: amount,
        paymentMethodId: flags['payment-method'],
      });

      if (flags.json) {
        printJson(intent, { quiet: flags.quiet });
        return;
      }

      const status = (intent as Record<string, unknown>).status as string | undefined;
      if (status === 'succeeded') {
        if (!flags.quiet) this.log(`Top-up of $${amount} succeeded.`);
        return;
      }

      // Need a confirmation step — open the dashboard top-up URL with the
      // PaymentIntent identifier so the user can finish in browser.
      const intentId = (intent as Record<string, unknown>).paymentIntentId as string | undefined ?? (intent as Record<string, unknown>).payment_intent_id as string | undefined;
      const dashboardBase = process.env.AERIOX_DASHBOARD_URL?.trim() ?? resolveBaseUrl().replace('api.', 'app.');
      const url = `${dashboardBase}/wallet/topup?pi=${encodeURIComponent(intentId ?? '')}&amount=${amount}`;

      if (flags['no-browser']) {
        process.stderr.write(`Open this URL to confirm: ${url}\n`);
      } else {
        try {
          await open(url);
        } catch {
          process.stderr.write(`Open this URL to confirm: ${url}\n`);
        }
      }
      if (!flags.quiet) this.log(`Top-up initiated. PaymentIntent: ${intentId ?? '(none)'}.`);
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

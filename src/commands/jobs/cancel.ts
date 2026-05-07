import { Args, Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { printError, printJson } from '../../lib/output/format.js';

export default class JobsCancel extends Command {
  static override description = 'Cancel a queued or running job.';

  static override args = {
    id: Args.string({ description: 'Job ID', required: true }),
  };

  static override flags = {
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(JobsCancel);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const job = await client.jobs.cancelJob({ id: args.id });
      if (flags.json) {
        printJson(job, { quiet: flags.quiet });
        return;
      }
      const refund = (job as Record<string, unknown>).refundedUsd ?? (job as Record<string, unknown>).refunded_usd ?? (job as Record<string, unknown>).chargedCostUsd ?? (job as Record<string, unknown>).charged_cost_usd ?? 0;
      if (!flags.quiet) this.log(`Cancelled ${args.id}. Refunded $${refund}.`);
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

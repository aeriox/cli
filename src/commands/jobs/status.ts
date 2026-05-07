import { Args, Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { printError, printJson } from '../../lib/output/format.js';

export default class JobsStatus extends Command {
  static override description = 'Get a single job status (one-shot read).';

  static override args = {
    id: Args.string({ description: 'Job ID', required: true }),
  };

  static override flags = {
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(JobsStatus);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const job = await client.jobs.getJob({ id: args.id });
      printJson(job, { quiet: flags.quiet });
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

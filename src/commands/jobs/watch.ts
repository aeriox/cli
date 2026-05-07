import { Args, Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { pollJob } from '../../lib/jobs.js';
import { withSpinner } from '../../lib/output/progress.js';
import { printError, printJson } from '../../lib/output/format.js';

export default class JobsWatch extends Command {
  static override description = 'Poll a job until it reaches a terminal state.';

  static override args = {
    id: Args.string({ description: 'Job ID', required: true }),
  };

  static override flags = {
    timeout: Flags.integer({ description: 'Timeout in seconds', default: 600 }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(JobsWatch);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const final = await withSpinner(
        `Watching ${args.id}...`,
        (spinner) =>
          pollJob(client, args.id, {
            spinner,
            timeoutMs: flags.timeout * 1000,
          }),
        { quiet: flags.quiet },
      );
      printJson(final, { quiet: flags.quiet });
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

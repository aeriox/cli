import { promises as fs } from 'node:fs';
import { Args, Command, Flags } from '@oclif/core';
import { getClient } from '../lib/api-client.js';
import { downloadOutputs, pollJob } from '../lib/jobs.js';
import { withSpinner } from '../lib/output/progress.js';
import { printError, printJson } from '../lib/output/format.js';

export default class Compose extends Command {
  static override description = 'Stitch multiple assets into a single video.';

  static override args = {
    file: Args.string({ description: 'Path to compose-request JSON file', required: true }),
  };

  static override flags = {
    output: Flags.string({ char: 'o', description: 'Output directory' }),
    'no-watch': Flags.boolean({ description: 'Return job descriptor immediately without polling' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID for multi-workspace users' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Compose);
    try {
      const raw = await fs.readFile(args.file, 'utf8');
      const request = JSON.parse(raw) as Parameters<
        Awaited<ReturnType<typeof getClient>>['generation']['composeVideo']
      >[0];
      const client = await getClient(flags.workspace ?? 'default');
      const dispatch = await client.generation.composeVideo(request);
      const job = (dispatch as Record<string, unknown>).result ?? dispatch;
      const jobId = (job as Record<string, unknown>).jobId as string | undefined ?? (job as Record<string, unknown>).job_id as string | undefined;
      if (!jobId) throw new Error('No job_id returned from /v1/compose');

      if (flags['no-watch']) {
        if (flags.json) printJson(job, { quiet: flags.quiet });
        else if (!flags.quiet) this.log(`Job dispatched: ${jobId}`);
        return;
      }

      const final = await withSpinner(
        `Composing (${jobId})...`,
        (spinner) => pollJob(client, jobId, { spinner, timeoutMs: 60 * 60 * 1000 }),
        { quiet: flags.quiet },
      );
      const status = (final as Record<string, unknown>).status as string | undefined;
      if (status !== 'completed' && status !== 'success') {
        printError(new Error(`Job ${jobId} ended in status: ${status}`), { json: flags.json, quiet: flags.quiet });
        if (flags.json) printJson(final);
        this.exit(1);
      }

      const written = await downloadOutputs(final, {
        outputDir: flags.output,
        basename: jobId,
        defaultExt: '.mp4',
      });
      if (flags.json) printJson({ job: final, files: written }, { quiet: flags.quiet });
      else if (!flags.quiet) for (const file of written) this.log(file);
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

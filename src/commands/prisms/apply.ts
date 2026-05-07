import { Args, Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { downloadOutputs, pollJob } from '../../lib/jobs.js';
import { withSpinner } from '../../lib/output/progress.js';
import { printError, printJson } from '../../lib/output/format.js';

export default class PrismsApply extends Command {
  static override description = 'Apply a prism to an existing asset or to a fresh generation.';

  static override args = {
    id: Args.string({ description: 'Prism ID', required: true }),
  };

  static override flags = {
    to: Flags.string({ description: 'Asset ID to transform' }),
    prompt: Flags.string({ description: 'New-generation prompt (when no --to)' }),
    model: Flags.string({ description: 'Model id (with --prompt)' }),
    'media': Flags.string({ description: 'image|video (with --prompt)', default: 'image' }),
    output: Flags.string({ char: 'o', description: 'Output directory' }),
    'no-watch': Flags.boolean({ description: 'Return job descriptor immediately without polling' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(PrismsApply);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const body: Record<string, unknown> = {};
      if (flags.to) {
        body.assetId = flags.to;
      } else if (flags.prompt) {
        if (flags.media === 'video') {
          body.videoParams = { model: flags.model ?? 'fal-ai/veo3/fast', prompt: flags.prompt };
        } else {
          body.imageParams = { model: flags.model ?? 'fal-ai/flux/schnell', prompt: flags.prompt };
        }
      } else {
        throw new Error('Provide --to <asset_id> OR --prompt <text>.');
      }

      const job = await client.prisms.applyPrism({ id: args.id, body: body as never });
      const jobId = (job as Record<string, unknown>).jobId as string | undefined ?? (job as Record<string, unknown>).job_id as string | undefined;
      if (!jobId) throw new Error('No job_id returned from /v1/prisms/:id/apply');

      if (flags['no-watch']) {
        if (flags.json) printJson(job, { quiet: flags.quiet });
        else if (!flags.quiet) this.log(`Job dispatched: ${jobId}`);
        return;
      }

      const final = await withSpinner(
        `Applying prism (${jobId})...`,
        (spinner) => pollJob(client, jobId, { spinner, timeoutMs: 60 * 60 * 1000 }),
        { quiet: flags.quiet },
      );
      const status = (final as Record<string, unknown>).status as string | undefined;
      if (status !== 'completed' && status !== 'success') {
        printError(new Error(`Job ${jobId} ended in status: ${status}`), { json: flags.json, quiet: flags.quiet });
        if (flags.json) printJson(final);
        this.exit(1);
      }

      const ext = flags.media === 'video' ? '.mp4' : '.png';
      const written = await downloadOutputs(final, { outputDir: flags.output, basename: jobId, defaultExt: ext });
      if (flags.json) printJson({ job: final, files: written }, { quiet: flags.quiet });
      else if (!flags.quiet) for (const file of written) this.log(file);
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

import { Args, Command, Flags } from '@oclif/core';
import { getClient } from '../lib/api-client.js';
import { downloadOutputs, pollJob } from '../lib/jobs.js';
import { withSpinner } from '../lib/output/progress.js';
import { printError, printJson } from '../lib/output/format.js';

export default class Generate extends Command {
  static override description = 'Generate an image from a prompt.';

  static override args = {
    prompt: Args.string({ description: 'Image prompt', required: true }),
  };

  static override flags = {
    model: Flags.string({ char: 'm', description: 'Model id', default: 'fal-ai/flux/schnell' }),
    resolution: Flags.string({ char: 'r', description: 'Resolution (e.g. 1024x1024)' }),
    'aspect-ratio': Flags.string({ description: 'Aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4)' }),
    output: Flags.string({ char: 'o', description: 'Output directory' }),
    character: Flags.string({ description: 'Character ID' }),
    prism: Flags.string({ description: 'Prism ID' }),
    seed: Flags.integer({ description: 'Seed' }),
    'no-watch': Flags.boolean({ description: 'Return job descriptor immediately without polling' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID for multi-workspace users' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Generate);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const aspect = flags['aspect-ratio'] as
        | '1:1'
        | '16:9'
        | '9:16'
        | '4:3'
        | '3:4'
        | undefined;
      const dispatch = await client.generation.generateImage({
        model: flags.model,
        prompt: args.prompt,
        aspectRatio: aspect,
        resolution: flags.resolution,
        characterId: flags.character,
        prismId: flags.prism,
        seed: flags.seed,
      });
      const job = (dispatch as Record<string, unknown>).result ?? dispatch;
      const jobId = (job as Record<string, unknown>).jobId as string | undefined ?? (job as Record<string, unknown>).job_id as string | undefined;
      if (!jobId) throw new Error('No job_id returned from /v1/images/generate');

      if (flags.json && flags['no-watch']) {
        printJson(job, { quiet: flags.quiet });
        return;
      }
      if (flags['no-watch']) {
        if (!flags.quiet) this.log(`Job dispatched: ${jobId}`);
        return;
      }

      const final = await withSpinner(
        `Generating image (${jobId})...`,
        (spinner) => pollJob(client, jobId, { spinner }),
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
        defaultExt: '.png',
      });
      if (flags.json) {
        printJson({ job: final, files: written }, { quiet: flags.quiet });
      } else if (!flags.quiet) {
        for (const file of written) this.log(file);
      }
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

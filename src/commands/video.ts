import { Args, Command, Flags } from '@oclif/core';
import { getClient } from '../lib/api-client.js';
import { downloadOutputs, pollJob } from '../lib/jobs.js';
import { withSpinner } from '../lib/output/progress.js';
import { printError, printJson } from '../lib/output/format.js';

export default class Video extends Command {
  static override description = 'Generate a video from a prompt.';

  static override args = {
    prompt: Args.string({ description: 'Video prompt', required: true }),
  };

  static override flags = {
    model: Flags.string({ char: 'm', description: 'Model id', default: 'fal-ai/veo3/fast' }),
    duration: Flags.integer({ char: 'd', description: 'Duration (seconds)' }),
    motion: Flags.string({ description: 'Motion preset id' }),
    'start-image': Flags.string({ description: 'URL or local path to seed image' }),
    audio: Flags.boolean({ description: 'Include synthesized audio' }),
    character: Flags.string({ description: 'Character ID' }),
    prism: Flags.string({ description: 'Prism ID' }),
    output: Flags.string({ char: 'o', description: 'Output directory' }),
    'no-watch': Flags.boolean({ description: 'Return job descriptor immediately without polling' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID for multi-workspace users' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Video);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      let imageUrl: string | undefined;
      if (flags['start-image']) {
        const v = flags['start-image'];
        if (v.startsWith('http://') || v.startsWith('https://')) {
          imageUrl = v;
        } else {
          throw new Error('Local file uploads for --start-image are not yet supported. Pass an https:// URL.');
        }
      }
      const dispatch = await client.generation.generateVideo({
        model: flags.model,
        prompt: args.prompt,
        durationS: flags.duration,
        withAudio: flags.audio,
        motionId: flags.motion,
        characterId: flags.character,
        prismId: flags.prism,
        imageUrl,
      });
      const job = (dispatch as Record<string, unknown>).result ?? dispatch;
      const jobId = (job as Record<string, unknown>).jobId as string | undefined ?? (job as Record<string, unknown>).job_id as string | undefined;
      if (!jobId) throw new Error('No job_id returned from /v1/videos/generate');

      if (flags['no-watch']) {
        if (flags.json) printJson(job, { quiet: flags.quiet });
        else if (!flags.quiet) this.log(`Job dispatched: ${jobId}`);
        return;
      }

      const final = await withSpinner(
        `Generating video (${jobId})...`,
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

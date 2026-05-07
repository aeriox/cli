import { Args, Command, Flags } from '@oclif/core';
import { getClient } from '../lib/api-client.js';
import { downloadOutputs, pollJob } from '../lib/jobs.js';
import { withSpinner } from '../lib/output/progress.js';
import { printError, printJson } from '../lib/output/format.js';

export default class Audio extends Command {
  static override description = 'Synthesize audio from text via ElevenLabs.';

  static override args = {
    text: Args.string({ description: 'Text to synthesize', required: true }),
  };

  static override flags = {
    voice: Flags.string({ description: 'Voice ID' }),
    character: Flags.string({ description: 'Character ID (uses character_voice_id)' }),
    model: Flags.string({ char: 'm', description: 'TTS model' }),
    output: Flags.string({ char: 'o', description: 'Output directory' }),
    'no-watch': Flags.boolean({ description: 'Return job descriptor immediately without polling' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID for multi-workspace users' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Audio);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const dispatch = await client.generation.generateAudio({
        text: args.text,
        voiceId: flags.voice,
        characterVoiceId: flags.character,
        model: flags.model,
      });
      const job = (dispatch as Record<string, unknown>).result ?? dispatch;
      const jobId = (job as Record<string, unknown>).jobId as string | undefined ?? (job as Record<string, unknown>).job_id as string | undefined;
      if (!jobId) throw new Error('No job_id returned from /v1/audio/generate');

      const status = (job as Record<string, unknown>).status as string | undefined;

      // Audio is sync — usually completes inline. Still poll if not terminal.
      let final = job as unknown;
      if (status !== 'completed' && status !== 'success' && !flags['no-watch']) {
        final = await withSpinner(
          `Generating audio (${jobId})...`,
          (spinner) => pollJob(client, jobId, { spinner }),
          { quiet: flags.quiet },
        );
      }

      if (flags['no-watch']) {
        if (flags.json) printJson(job, { quiet: flags.quiet });
        else if (!flags.quiet) this.log(`Job dispatched: ${jobId}`);
        return;
      }

      const finalStatus = (final as Record<string, unknown>).status as string | undefined;
      if (finalStatus !== 'completed' && finalStatus !== 'success') {
        printError(new Error(`Job ${jobId} ended in status: ${finalStatus}`), { json: flags.json, quiet: flags.quiet });
        if (flags.json) printJson(final);
        this.exit(1);
      }

      const written = await downloadOutputs(final, {
        outputDir: flags.output,
        basename: jobId,
        defaultExt: '.mp3',
      });
      if (flags.json) printJson({ job: final, files: written }, { quiet: flags.quiet });
      else if (!flags.quiet) for (const file of written) this.log(file);
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

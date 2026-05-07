import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Args, Command, Flags } from '@oclif/core';
import ora from 'ora';
import { getClient } from '../lib/api-client.js';
import { defaultOutputDir, downloadOutputs, pollJob } from '../lib/jobs.js';
import { printError, printJson } from '../lib/output/format.js';

interface BatchResult {
  index: number;
  prompt: string;
  job_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  files: string[];
  error?: string;
}

function slugify(text: string, max = 32): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'prompt';
}

export default class Batch extends Command {
  static override description = 'Run a batch of generate calls from a prompts file (one prompt per line).';

  static override args = {
    file: Args.string({ description: 'Path to prompts file (one prompt per line)', required: true }),
  };

  static override flags = {
    concurrency: Flags.integer({ description: 'Max concurrent jobs', default: 3 }),
    'output-dir': Flags.string({ description: 'Output directory' }),
    model: Flags.string({ char: 'm', description: 'Model id', default: 'fal-ai/flux/schnell' }),
    'aspect-ratio': Flags.string({ description: 'Aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4)' }),
    json: Flags.boolean({ description: 'Output JSON summary at end' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Batch);
    try {
      const raw = await fs.readFile(args.file, 'utf8');
      const prompts = raw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('#'));
      if (!prompts.length) {
        throw new Error('Prompts file is empty.');
      }
      const outputDir = flags['output-dir'] ?? defaultOutputDir();
      await fs.mkdir(outputDir, { recursive: true });

      const client = await getClient(flags.workspace ?? 'default');
      const concurrency = Math.max(1, flags.concurrency);
      const aspect = flags['aspect-ratio'] as
        | '1:1'
        | '16:9'
        | '9:16'
        | '4:3'
        | '3:4'
        | undefined;

      const results: BatchResult[] = prompts.map((prompt, index) => ({
        index,
        prompt,
        status: 'pending',
        files: [],
      }));

      const useSpinner = !flags.quiet && process.stdout.isTTY;
      const spinner = useSpinner ? ora('Starting batch...').start() : null;

      const updateSpinnerText = (): void => {
        if (!spinner) return;
        const completed = results.filter((r) => r.status === 'completed').length;
        const failed = results.filter((r) => r.status === 'failed').length;
        const running = results.filter((r) => r.status === 'running').length;
        spinner.text = `batch: ${completed}/${prompts.length} done, ${running} running, ${failed} failed`;
      };

      let cursor = 0;
      const runOne = async (i: number): Promise<void> => {
        const r = results[i]!;
        r.status = 'running';
        updateSpinnerText();
        try {
          const dispatch = await client.generation.generateImage({
            model: flags.model,
            prompt: r.prompt,
            aspectRatio: aspect,
          });
          const job = (dispatch as Record<string, unknown>).result ?? dispatch;
          const jobId = (job as Record<string, unknown>).jobId as string | undefined ?? (job as Record<string, unknown>).job_id as string | undefined;
          if (!jobId) throw new Error('No job_id returned');
          r.job_id = jobId;

          const final = await pollJob(client, jobId);
          const status = (final as Record<string, unknown>).status as string | undefined;
          if (status !== 'completed' && status !== 'success') {
            throw new Error(`Job ${jobId} ended in status: ${status}`);
          }
          const written = await downloadOutputs(final, {
            outputDir,
            basename: `${String(i).padStart(3, '0')}-${slugify(r.prompt)}`,
            defaultExt: '.png',
          });
          r.files = written;
          r.status = 'completed';
        } catch (err) {
          r.error = (err as Error).message;
          r.status = 'failed';
        } finally {
          updateSpinnerText();
        }
      };

      const workers: Promise<void>[] = [];
      const next = async (): Promise<void> => {
        while (true) {
          const i = cursor;
          cursor += 1;
          if (i >= prompts.length) return;
          await runOne(i);
        }
      };
      for (let w = 0; w < concurrency; w += 1) workers.push(next());
      await Promise.all(workers);

      const failed = results.filter((r) => r.status === 'failed');
      if (spinner) {
        if (failed.length) spinner.fail(`batch: ${failed.length} failed`);
        else spinner.succeed(`batch: ${results.length}/${results.length} completed`);
      }

      if (flags.json) {
        printJson({ outputDir, results }, { quiet: flags.quiet });
      } else if (!flags.quiet) {
        for (const r of results) {
          if (r.status === 'completed') {
            this.log(`[ok] ${r.prompt}`);
            for (const f of r.files) this.log(`     ${path.relative(process.cwd(), f)}`);
          } else {
            this.log(`[fail] ${r.prompt}: ${r.error ?? 'unknown error'}`);
          }
        }
      }
      if (failed.length) this.exit(1);
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

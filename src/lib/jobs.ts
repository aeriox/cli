import { promises as fs, createWriteStream } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Aeriox } from '@aeriox-co/api';
import type { Ora } from 'ora';

const TERMINAL_STATUSES = new Set(['completed', 'success', 'failed', 'cancelled', 'nsfw_blocked']);

export function isTerminalStatus(status: string | undefined): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}

export async function pollJob(
  client: Aeriox,
  jobId: string,
  opts: { intervalMs?: number; timeoutMs?: number; spinner?: Ora } = {},
): Promise<unknown> {
  const interval = opts.intervalMs ?? 2000;
  const timeout = opts.timeoutMs ?? 30 * 60 * 1000;
  const start = Date.now();
  while (true) {
    const job = await client.jobs.getJob({ id: jobId });
    const status = (job as Record<string, unknown>).status as string | undefined;
    const progress = (job as Record<string, unknown>).progressPct ?? (job as Record<string, unknown>).progress_pct;
    if (opts.spinner) {
      opts.spinner.text = `Job ${jobId}: ${status ?? 'pending'}${progress != null ? ` (${progress}%)` : ''}`;
    }
    if (isTerminalStatus(status)) return job;
    if (Date.now() - start > timeout) {
      throw new Error(`Job ${jobId} did not reach terminal state within ${timeout}ms`);
    }
    await sleep(interval);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function defaultOutputDir(): string {
  return process.env.AERIOX_OUTPUT_DIR?.trim() || path.join(os.homedir(), 'aeriox-output');
}

function inferExtension(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname);
    if (ext) return ext;
  } catch {
    // ignore
  }
  return fallback;
}

export async function downloadOutputs(
  job: unknown,
  opts: { outputDir?: string; basename?: string; defaultExt?: string } = {},
): Promise<string[]> {
  const j = job as Record<string, unknown>;
  const urls: string[] = (j.outputUrls as string[] | undefined) ?? (j.output_urls as string[] | undefined) ?? [];
  if (!urls.length) return [];
  const dir = opts.outputDir ?? defaultOutputDir();
  await fs.mkdir(dir, { recursive: true });
  const base = opts.basename ?? (j.jobId as string | undefined) ?? (j.job_id as string | undefined) ?? `out-${Date.now()}`;
  const written: string[] = [];
  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i]!;
    const ext = inferExtension(url, opts.defaultExt ?? '.bin');
    const target = path.join(dir, urls.length === 1 ? `${base}${ext}` : `${base}-${i}${ext}`);
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download ${url}: ${res.status}`);
    }
    const stream = createWriteStream(target);
    const reader = res.body.getReader();
    await new Promise<void>((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', resolve);
      const pump = async (): Promise<void> => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) stream.write(Buffer.from(value));
          }
          stream.end();
        } catch (err) {
          reject(err as Error);
        }
      };
      void pump();
    });
    written.push(target);
  }
  return written;
}

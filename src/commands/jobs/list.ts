import { Command, Flags } from '@oclif/core';
import { getBearer } from '../../lib/api-client.js';
import { printError, printJson, printTable } from '../../lib/output/format.js';

export default class JobsList extends Command {
  static override description = 'List recent jobs in the workspace.';

  static override flags = {
    limit: Flags.integer({ description: 'Max rows', default: 50 }),
    status: Flags.string({ description: 'Filter by status (queued|running|completed|failed|cancelled|nsfw_blocked)' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(JobsList);
    try {
      const { token, baseUrl } = await getBearer(flags.workspace ?? 'default');
      const url = new URL(`${baseUrl}/v1/jobs`);
      url.searchParams.set('limit', String(flags.limit));
      if (flags.status) url.searchParams.set('status', flags.status);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        throw new Error(`GET /v1/jobs failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as Record<string, unknown>;
      const rows = (body.data as Array<Record<string, unknown>> | undefined) ?? [];
      if (flags.json) {
        printJson(body, { quiet: flags.quiet });
        return;
      }
      printTable(rows, [
        { header: 'job_id', get: (r) => String(r.jobId ?? r.job_id ?? r.id ?? '') },
        { header: 'type', get: (r) => String(r.type ?? '') },
        { header: 'status', get: (r) => String(r.status ?? '') },
        { header: 'progress', get: (r) => String(r.progressPct ?? r.progress_pct ?? '') },
        { header: 'created_at', get: (r) => String(r.createdAt ?? r.created_at ?? '') },
      ], { quiet: flags.quiet });
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

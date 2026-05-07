import { Command, Flags } from '@oclif/core';
import { getBearer } from '../../lib/api-client.js';
import { printError, printJson, printTable } from '../../lib/output/format.js';

export default class KeysList extends Command {
  static override description = 'List API keys for the workspace.';

  static override flags = {
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(KeysList);
    try {
      const { token, baseUrl } = await getBearer(flags.workspace ?? 'default');
      const res = await fetch(`${baseUrl}/v1/api-keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`GET /v1/api-keys failed: ${res.status} ${await res.text()}`);
      const body = (await res.json()) as Record<string, unknown>;
      if (flags.json) {
        printJson(body, { quiet: flags.quiet });
        return;
      }
      const rows = (body.data as Array<Record<string, unknown>> | undefined)
        ?? (Array.isArray(body) ? (body as Array<Record<string, unknown>>) : []);
      printTable(rows, [
        { header: 'id', get: (r) => String(r.id ?? '') },
        { header: 'prefix', get: (r) => String(r.prefix ?? r.keyPrefix ?? '') },
        { header: 'scopes', get: (r) => String((r.scopes as string[] | undefined)?.join(',') ?? '') },
        { header: 'created_at', get: (r) => String(r.createdAt ?? r.created_at ?? '') },
        { header: 'last_used_at', get: (r) => String(r.lastUsedAt ?? r.last_used_at ?? '') },
      ], { quiet: flags.quiet });
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

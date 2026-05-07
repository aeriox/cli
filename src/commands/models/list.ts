import { Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { printError, printJson, printTable } from '../../lib/output/format.js';

export default class ModelsList extends Command {
  static override description = 'List supported models with capabilities and pricing.';

  static override flags = {
    type: Flags.string({ description: 'Filter by type (image|video|audio)' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(ModelsList);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const res = await client.discovery.listModels();
      const data = (res as Record<string, unknown>).data ?? (res as Record<string, unknown>).models ?? [];
      let rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
      if (flags.type) {
        rows = rows.filter((r) => String(r.type ?? r.mediaType ?? '').toLowerCase() === flags.type!.toLowerCase());
      }
      if (flags.json) {
        printJson(rows, { quiet: flags.quiet });
        return;
      }
      printTable(rows, [
        { header: 'id', get: (r) => String(r.id ?? r.modelId ?? '') },
        { header: 'type', get: (r) => String(r.type ?? r.mediaType ?? '') },
        { header: 'name', get: (r) => String(r.name ?? '') },
        { header: 'unit_price_usd', get: (r) => String(r.unitPriceUsd ?? r.unit_price_usd ?? '') },
      ], { quiet: flags.quiet });
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

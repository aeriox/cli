import { Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { printError, printJson, printTable } from '../../lib/output/format.js';

export default class PrismsList extends Command {
  static override description = 'List preset prisms.';

  static override flags = {
    category: Flags.string({ description: 'Filter by category' }),
    'media-type': Flags.string({ description: 'Filter by compatible media type (image|video)' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(PrismsList);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const res = await client.prisms.listPrisms({
        category: flags.category,
        compatibleWith: flags['media-type'] as 'image' | 'video' | 'audio' | undefined,
      });
      if (flags.json) {
        printJson(res, { quiet: flags.quiet });
        return;
      }
      const rows = (res as Record<string, unknown>).data as Array<Record<string, unknown>> | undefined ?? [];
      printTable(rows, [
        { header: 'id', get: (r) => String(r.id ?? '') },
        { header: 'name', get: (r) => String(r.name ?? '') },
        { header: 'category', get: (r) => String(r.category ?? '') },
        { header: 'media', get: (r) => String((r.compatibleMediaTypes as string[] | undefined)?.join(',') ?? r.mediaType ?? '') },
      ], { quiet: flags.quiet });
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

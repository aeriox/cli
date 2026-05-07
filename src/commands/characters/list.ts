import { Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { printError, printJson, printTable } from '../../lib/output/format.js';

export default class CharactersList extends Command {
  static override description = 'List workspace characters.';

  static override flags = {
    limit: Flags.integer({ description: 'Page size', default: 50 }),
    cursor: Flags.string({ description: 'Pagination cursor' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(CharactersList);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const res = await client.characters.listCharacters({ limit: flags.limit, cursor: flags.cursor });
      if (flags.json) {
        printJson(res, { quiet: flags.quiet });
        return;
      }
      const rows = (res as Record<string, unknown>).data as Array<Record<string, unknown>> | undefined ?? [];
      printTable(rows, [
        { header: 'id', get: (r) => String(r.id ?? r.characterId ?? '') },
        { header: 'name', get: (r) => String(r.name ?? '') },
        { header: 'created_at', get: (r) => String(r.createdAt ?? r.created_at ?? '') },
      ], { quiet: flags.quiet });
      const next = (res as Record<string, unknown>).nextCursor;
      if (next && !flags.quiet) this.log(`(next cursor: ${next})`);
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

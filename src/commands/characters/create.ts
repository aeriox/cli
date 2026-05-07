import { Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { printError, printJson } from '../../lib/output/format.js';

export default class CharactersCreate extends Command {
  static override description = 'Create + train a character from reference image URLs.';

  static override flags = {
    name: Flags.string({ description: 'Character name', required: true }),
    images: Flags.string({
      description: 'Image URL (https://). Repeat for multiple.',
      multiple: true,
      required: true,
    }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(CharactersCreate);
    try {
      const urls = flags.images.map((s) => s.trim()).filter(Boolean);
      const bad = urls.find((u) => !u.startsWith('http://') && !u.startsWith('https://'));
      if (bad) {
        throw new Error(`--images expects https:// URLs (got "${bad}"). Local-file uploads are not yet supported by the SDK.`);
      }
      const client = await getClient(flags.workspace ?? 'default');
      const res = await client.characters.createCharacter({
        name: flags.name,
        imageUrls: urls,
      });
      if (flags.json) {
        printJson(res, { quiet: flags.quiet });
      } else if (!flags.quiet) {
        const characterId = (res as Record<string, unknown>).characterId ?? (res as Record<string, unknown>).character_id;
        const jobId = (res as Record<string, unknown>).jobId ?? (res as Record<string, unknown>).job_id;
        this.log(`character_id: ${String(characterId ?? '?')}`);
        this.log(`training_job_id: ${String(jobId ?? '?')}`);
      }
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

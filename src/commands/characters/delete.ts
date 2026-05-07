import { Args, Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { printError } from '../../lib/output/format.js';

export default class CharactersDelete extends Command {
  static override description = 'Soft-delete a character.';

  static override args = {
    id: Args.string({ description: 'Character ID', required: true }),
  };

  static override flags = {
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(CharactersDelete);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      await client.characters.deleteCharacter({ id: args.id });
      if (flags.json) {
        process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      } else if (!flags.quiet) {
        this.log(`Deleted ${args.id}`);
      }
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

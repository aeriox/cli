import { Args, Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { printError, printJson } from '../../lib/output/format.js';

export default class CharactersGet extends Command {
  static override description = 'Fetch a single character.';

  static override args = {
    id: Args.string({ description: 'Character ID', required: true }),
  };

  static override flags = {
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(CharactersGet);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const character = await client.characters.getCharacter({ id: args.id });
      printJson(character, { quiet: flags.quiet });
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

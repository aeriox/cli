import { Args, Command, Flags } from '@oclif/core';
import { getClient } from '../../lib/api-client.js';
import { colorize, printError, printJson } from '../../lib/output/format.js';

export default class KeysRotate extends Command {
  static override description = 'Rotate an API key. Returns the new plaintext value once.';

  static override args = {
    id: Args.string({ description: 'API key ID to rotate', required: true }),
  };

  static override flags = {
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(KeysRotate);
    try {
      const client = await getClient(flags.workspace ?? 'default');
      const res = await client.apiKeys.rotateApiKey({ id: args.id });
      if (flags.json) {
        printJson(res, { quiet: flags.quiet });
        return;
      }
      const r = res as Record<string, unknown>;
      if (!flags.quiet) {
        this.log(colorize('This is the only time you will see this key. Store it securely now.', 'yellow'));
        this.log(`id: ${String(r.newKeyId ?? r.new_key_id ?? '?')}`);
        this.log(`key: ${String(r.newKey ?? r.new_key ?? '?')}`);
        if (r.oldExpiresAt ?? r.old_expires_at) {
          this.log(`old key expires at: ${String(r.oldExpiresAt ?? r.old_expires_at)}`);
        }
      }
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

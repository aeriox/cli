import { Args, Command, Flags } from '@oclif/core';
import { getBearer } from '../../lib/api-client.js';
import { printError } from '../../lib/output/format.js';

export default class KeysDelete extends Command {
  static override description = 'Revoke an API key.';

  static override args = {
    id: Args.string({ description: 'API key ID', required: true }),
  };

  static override flags = {
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(KeysDelete);
    try {
      const { token, baseUrl } = await getBearer(flags.workspace ?? 'default');
      const res = await fetch(`${baseUrl}/v1/api-keys/${encodeURIComponent(args.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`DELETE /v1/api-keys/${args.id} failed: ${res.status} ${await res.text()}`);
      }
      if (flags.json) {
        process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      } else if (!flags.quiet) {
        this.log(`Revoked ${args.id}`);
      }
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

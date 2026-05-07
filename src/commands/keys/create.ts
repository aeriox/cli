import { Command, Flags } from '@oclif/core';
import { getBearer } from '../../lib/api-client.js';
import { colorize, printError, printJson } from '../../lib/output/format.js';

export default class KeysCreate extends Command {
  static override description = 'Mint a new API key. The plaintext is shown once.';

  static override flags = {
    name: Flags.string({ description: 'Human-readable label' }),
    scope: Flags.string({ description: 'Comma-separated scopes', default: 'generate,read' }),
    json: Flags.boolean({ description: 'Output JSON' }),
    quiet: Flags.boolean({ description: 'Suppress non-error output' }),
    workspace: Flags.string({ char: 'w', description: 'Workspace ID' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(KeysCreate);
    try {
      const { token, baseUrl } = await getBearer(flags.workspace ?? 'default');
      const res = await fetch(`${baseUrl}/v1/api-keys`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: flags.name,
          scopes: flags.scope.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error(`POST /v1/api-keys failed: ${res.status} ${await res.text()}`);
      const body = (await res.json()) as Record<string, unknown>;
      if (flags.json) {
        printJson(body, { quiet: flags.quiet });
        return;
      }
      const key = body.key ?? body.plaintext ?? body.apiKey ?? body.api_key;
      const id = body.id ?? body.keyId ?? body.key_id;
      if (!flags.quiet) {
        this.log(colorize('This is the only time you will see this key. Store it securely now.', 'yellow'));
        this.log(`id: ${String(id ?? '?')}`);
        this.log(`key: ${String(key ?? '?')}`);
      }
    } catch (err) {
      printError(err, { json: flags.json, quiet: flags.quiet });
      this.exit(1);
    }
  }
}

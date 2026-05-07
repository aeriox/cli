import ora, { type Ora } from 'ora';

export async function withSpinner<T>(label: string, fn: (spinner: Ora) => Promise<T>, opts: { quiet?: boolean } = {}): Promise<T> {
  if (opts.quiet || !process.stdout.isTTY) {
    // No spinner — just run. Print label to stderr for context.
    if (!opts.quiet) process.stderr.write(`${label}\n`);
    return fn({
      text: label,
      // Minimal stub matching the Ora surface we use.
      start() { return this as unknown as Ora; },
      stop() { return this as unknown as Ora; },
      succeed() { return this as unknown as Ora; },
      fail() { return this as unknown as Ora; },
      warn() { return this as unknown as Ora; },
      info() { return this as unknown as Ora; },
    } as unknown as Ora);
  }
  const spinner = ora(label).start();
  try {
    const result = await fn(spinner);
    spinner.stop();
    return result;
  } catch (err) {
    spinner.fail((err as Error).message);
    throw err;
  }
}

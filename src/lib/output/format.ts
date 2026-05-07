import chalk from 'chalk';
import Table from 'cli-table3';

function colorEnabled(): boolean {
  if (process.env.AERIOX_NO_COLOR === '1') return false;
  if (process.env.NO_COLOR) return false;
  return true;
}

export function colorize(text: string, color: 'red' | 'green' | 'yellow' | 'cyan' | 'gray'): string {
  if (!colorEnabled()) return text;
  return chalk[color](text);
}

export interface Column<T> {
  header: string;
  get: (row: T) => string | number | undefined;
}

export function printTable<T>(rows: T[], columns: Column<T>[], opts: { quiet?: boolean } = {}): void {
  if (opts.quiet) return;
  const table = new Table({ head: columns.map((c) => c.header) });
  for (const row of rows) {
    table.push(columns.map((c) => String(c.get(row) ?? '')));
  }
  process.stdout.write(`${table.toString()}\n`);
}

export function printJson(obj: unknown, opts: { quiet?: boolean } = {}): void {
  if (opts.quiet) return;
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

export function printError(err: unknown, opts: { quiet?: boolean; json?: boolean } = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  if (opts.json) {
    process.stderr.write(`${JSON.stringify({ error: message })}\n`);
    return;
  }
  if (opts.quiet) {
    process.stderr.write(`${message}\n`);
    return;
  }
  process.stderr.write(`${colorize('error:', 'red')} ${message}\n`);
}

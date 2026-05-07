// Re-export the oclif `run` entrypoint so this package can be invoked
// programmatically (e.g. `import { run } from '@aeriox-co/cli'`).
//
// At v0.0.0 this is a reservation stub; the real bin lives at `bin/run.js`
// and prints a deprecation notice. Subcommands are added in Tasks 4-12.
export { run } from '@oclif/core';

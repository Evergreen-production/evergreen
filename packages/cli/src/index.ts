#!/usr/bin/env node
/**
 * Evergreen CLI entry point.
 * Delegates all commands to Commander.js.
 */

import { program } from "./program.js";

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n[evergreen] Error: ${message}`);
  process.exit(3);
});

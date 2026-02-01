#!/usr/bin/env node

/**
 * Main CLI entry point for ccrank
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { setupCommand } from './commands/setup';
import { syncCommand } from './commands/sync';
import { statusCommand } from './commands/status';
import { logoutCommand } from './commands/logout';

const program = new Command();

program
  .name('ccrank')
  .description('CLI tool to sync Claude Code usage to the ccrank leaderboard')
  .version('1.0.0');

// Setup command
program
  .command('setup <api-key>')
  .description('Configure ccrank with your API key and install Claude Code hook')
  .action(async (apiKey: string) => {
    await setupCommand(apiKey);
  });

// Sync command
program
  .command('sync')
  .description('Upload Claude Code usage stats to the leaderboard')
  .option('--stdin', 'Read JSON from stdin (pipe from ccusage)')
  .option('--period <period>', 'Period to sync (daily, weekly, monthly)', 'daily')
  .option('--dry-run', 'Show what would be synced without uploading')
  .option('--quiet', 'Suppress output (for hook usage)')
  .option('--user <username>', 'Username (if not configured)')
  .action(async (options) => {
    await syncCommand(options);
  });

// Status command
program
  .command('status')
  .description('Show current authentication status')
  .action(async () => {
    await statusCommand();
  });

// Logout command
program
  .command('logout')
  .description('Clear stored credentials')
  .action(async () => {
    await logoutCommand();
  });

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('\nInvalid command: %s\n'), program.args.join(' '));
  console.log('See --help for a list of available commands.\n');
  process.exit(1);
});

// Show help if no command provided
if (process.argv.length === 2) {
  program.outputHelp();
  console.log('\nQuick start:');
  console.log(chalk.cyan('  1. ccrank setup <your-api-key>'));
  console.log(chalk.cyan('  2. ccrank sync'));
  console.log(chalk.gray('\nAfter setup, usage is synced automatically after each Claude Code session.\n'));
}

// Parse arguments and execute
program.parse(process.argv);

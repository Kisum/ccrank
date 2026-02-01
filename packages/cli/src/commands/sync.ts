/**
 * Sync command - upload ccusage stats to leaderboard
 */

import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { getApiEndpoint, readConfig } from '../config';
import { validateCCUsageData, transformToLeaderboardEntries, getSummaryStats } from '../transformer';
import { CCUsageOutput } from '../types';

/**
 * Read JSON from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    process.stdin.on('data', (chunk) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    process.stdin.on('error', (error) => {
      reject(error);
    });

    // Set timeout for stdin reading
    setTimeout(() => {
      reject(new Error('Timeout waiting for stdin input'));
    }, 10000);
  });
}

/**
 * Try to run ccusage command with given method
 */
function tryRunCCUsage(period: string, command: string): CCUsageOutput {
  try {
    const output = execSync(`${command} ${period} --json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    return JSON.parse(output);
  } catch (error: any) {
    // Re-throw with stderr attached for better error handling
    if (error.stderr) {
      error.stderr = error.stderr.toString();
    }
    throw error;
  }
}

/**
 * Run ccusage command and get JSON output
 * Tries local install first, then falls back to npx
 */
function runCCUsage(period: string = 'daily'): CCUsageOutput {
  const errors: string[] = [];

  // Try 1: Check if ccusage is available globally/locally
  try {
    return tryRunCCUsage(period, 'ccusage');
  } catch (error: any) {
    // Check for command not found (ENOENT or stderr containing 'not found')
    const stderr = error.stderr || '';
    if (error.code === 'ENOENT' || stderr.includes('not found') || stderr.includes('No such')) {
      errors.push('Local ccusage not found');
    } else {
      throw new Error(`Failed to run ccusage: ${error.message}`);
    }
  }

  // Try 2: Use npx to run without installation
  try {
    return tryRunCCUsage(period, 'npx ccusage@latest');
  } catch (error: any) {
    errors.push(`npx fallback failed: ${error.message}`);
  }

  // Try 3: Use pnpm dlx as another fallback
  try {
    return tryRunCCUsage(period, 'pnpm dlx ccusage@latest');
  } catch (error: any) {
    errors.push(`pnpm fallback failed: ${error.message}`);
  }

  // All methods failed
  throw new Error(
    `ccusage could not be executed.\n\n` +
    `Attempts made:\n` +
    errors.map(e => `  - ${e}`).join('\n') +
    `\n\nTo fix this, you can:\n` +
    `  1. Install ccusage globally: npm install -g ccusage\n` +
    `  2. Or ensure npx is available (comes with Node.js)\n` +
    `  3. Or pipe data manually: ccusage --json | ccrank sync --stdin`
  );
}

/**
 * Sync data using public API (no auth required)
 */
async function syncPublic(
  entries: any[],
  username: string,
  apiEndpoint: string,
  quiet: boolean
): Promise<{ success: boolean; message: string; entriesProcessed: number }> {
  const url = new URL(apiEndpoint);
  url.searchParams.set('user', username);
  
  // Add timezone offset
  const tzOffset = new Date().getTimezoneOffset();
  const sign = tzOffset <= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(tzOffset) % 60).padStart(2, '0');
  url.searchParams.set('tz', `${sign}${hours}${minutes}`);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daily: entries }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const result = await response.json() as { message: string; count: number };
  return {
    success: true,
    message: result.message,
    entriesProcessed: result.count,
  };
}

/**
 * Sync command handler
 */
export async function syncCommand(options: {
  stdin?: boolean;
  period?: string;
  dryRun?: boolean;
  quiet?: boolean;
  user?: string;
}): Promise<void> {
  const quiet = options.quiet || false;

  // Helper functions for quiet mode
  const log = (...args: any[]) => {
    if (!quiet) console.log(...args);
  };
  const logError = (...args: any[]) => {
    if (!quiet) console.error(...args);
  };

  // Create spinner that respects quiet mode
  const spinner = quiet ? {
    start: () => ({ succeed: () => {}, fail: () => {}, warn: () => {} }),
    succeed: () => {},
    fail: () => {},
    warn: () => {},
  } : ora();

  try {
    // Get config (optional - public sync doesn't require auth)
    const config = readConfig();
    
    // Determine username: --user flag > config > error
    const username = options.user || config?.username;
    if (!username) {
      throw new Error('Username required. Run: ccrank setup <username> or use --user <username>');
    }

    const apiEndpoint = getApiEndpoint(config);

    // Get ccusage data
    if (!quiet) (spinner as any).start?.('Loading ccusage data...');
    let ccusageData: CCUsageOutput;

    if (options.stdin) {
      // Read from stdin
      const stdinData = await readStdin();
      ccusageData = JSON.parse(stdinData);
    } else {
      // Run ccusage internally
      const period = options.period || 'daily';
      ccusageData = runCCUsage(period);
    }

    // Validate data
    if (!validateCCUsageData(ccusageData)) {
      if (!quiet) (spinner as any).fail?.('Invalid ccusage data format');
      throw new Error('The provided data is not valid ccusage output');
    }

    if (ccusageData.daily.length === 0) {
      if (!quiet) (spinner as any).warn?.('No daily usage data to sync');
      log(chalk.yellow('\nNo usage data found. Try using ccusage with a different time range.\n'));
      return;
    }

    if (!quiet) (spinner as any).succeed?.('Data loaded successfully');

    // Get summary stats
    const stats = getSummaryStats(ccusageData);
    log(chalk.gray(`\n  Days: ${stats.totalDays}`));
    log(chalk.gray(`  Total tokens: ${stats.totalTokens.toLocaleString()}`));
    log(chalk.gray(`  Total cost: $${stats.totalCost.toFixed(2)}`));
    log(chalk.gray(`  Models: ${stats.uniqueModels}\n`));

    // Transform to leaderboard entries
    if (!quiet) (spinner as any).start?.('Transforming data...');
    const entries = transformToLeaderboardEntries(ccusageData, username);
    if (!quiet) (spinner as any).succeed?.(`Prepared ${entries.length} entries for sync`);

    if (options.dryRun) {
      log(chalk.blue('\n[DRY RUN] Would sync the following entries:\n'));
      log(JSON.stringify(entries, null, 2));
      log(chalk.blue('\nDry run complete. No data was uploaded.\n'));
      return;
    }

    // Upload to API (public - no auth required)
    if (!quiet) (spinner as any).start?.('Syncing to leaderboard...');
    const response = await syncPublic(entries, username, apiEndpoint, quiet);

    if (response.success) {
      if (!quiet) (spinner as any).succeed?.('Sync completed successfully!');
      log(chalk.green(`\n✓ ${response.message}`));
      log(chalk.gray(`  Entries processed: ${response.entriesProcessed}`));
      log(chalk.cyan(`\n  View leaderboard: https://ccusageshare-leaderboard.vercel.app\n`));
    } else {
      if (!quiet) (spinner as any).fail?.('Sync failed');
      throw new Error(response.message);
    }
  } catch (error) {
    if (!quiet) (spinner as any).fail?.('Sync failed');
    logError(chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`));
    // Don't exit with error code in quiet mode (for hook usage)
    if (!quiet) process.exit(1);
  }
}

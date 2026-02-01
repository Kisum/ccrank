/**
 * Sync command - upload ccusage stats to leaderboard
 */

import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { requireAuth, getApiEndpoint } from '../config';
import { validateCCUsageData, transformToLeaderboardEntries, getSummaryStats } from '../transformer';
import { syncToLeaderboard } from '../api';
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
 * Run ccusage command and get JSON output
 */
function runCCUsage(period: string = 'daily'): CCUsageOutput {
  try {
    const output = execSync(`ccusage ${period} --json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return JSON.parse(output);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('ccusage command not found. Please install ccusage first.');
    }
    throw new Error(`Failed to run ccusage: ${error.message}`);
  }
}

/**
 * Sync command handler
 */
export async function syncCommand(options: {
  stdin?: boolean;
  period?: string;
  dryRun?: boolean;
  quiet?: boolean;
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
    // Check authentication
    const config = requireAuth();
    const apiEndpoint = getApiEndpoint(config);

    if (!config.username) {
      throw new Error('Username not found in config. Please run: ccrank setup <api-key>');
    }

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
    const entries = transformToLeaderboardEntries(ccusageData, config.username);
    if (!quiet) (spinner as any).succeed?.(`Prepared ${entries.length} entries for sync`);

    if (options.dryRun) {
      log(chalk.blue('\n[DRY RUN] Would sync the following entries:\n'));
      log(JSON.stringify(entries, null, 2));
      log(chalk.blue('\nDry run complete. No data was uploaded.\n'));
      return;
    }

    // Upload to API
    if (!quiet) (spinner as any).start?.('Syncing to leaderboard...');
    const response = await syncToLeaderboard(entries, config.apiKey, apiEndpoint);

    if (response.success) {
      if (!quiet) (spinner as any).succeed?.('Sync completed successfully!');
      log(chalk.green(`\n✓ ${response.message}`));
      log(chalk.gray(`  Entries processed: ${response.entriesProcessed}`));

      if (response.leaderboardUrl) {
        log(chalk.cyan(`\n  View leaderboard: ${response.leaderboardUrl}\n`));
      }
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

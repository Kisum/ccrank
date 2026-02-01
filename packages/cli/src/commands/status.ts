/**
 * Status command - show current authentication status
 */

import { execSync } from 'child_process';
import chalk from 'chalk';
import { readConfig, getApiEndpoint } from '../config';

/**
 * Check if a command is available
 */
function isCommandAvailable(command: string): boolean {
  try {
    execSync(command, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check ccusage availability
 */
function checkCCUsage(): { local: boolean; npx: boolean } {
  const local = isCommandAvailable('ccusage --version');
  const npx = isCommandAvailable('npx --version');
  return { local, npx };
}

/**
 * Status command handler
 */
export async function statusCommand(): Promise<void> {
  const config = readConfig();

  console.log(chalk.bold('\nccrank Status\n'));

  // Check ccusage availability
  const ccusage = checkCCUsage();
  console.log(chalk.gray('ccusage:'));
  if (ccusage.local) {
    console.log(chalk.green('  ✓ Local install found'));
  } else if (ccusage.npx) {
    console.log(chalk.yellow('  ⚠ Not installed locally'));
    console.log(chalk.gray('  ✓ npx available (will auto-install on first sync)'));
  } else {
    console.log(chalk.red('  ✗ Not available'));
    console.log(chalk.gray('  Install: npm install -g ccusage'));
  }
  console.log();

  if (!config || !config.username) {
    console.log(chalk.yellow('Status: Not configured'));
    console.log(chalk.gray('\nRun this command to set up:'));
    console.log(chalk.cyan('  ccrank setup <username>\n'));
    return;
  }

  console.log(chalk.green('Status: Configured'));
  console.log(chalk.gray(`\nUsername: ${config.username}`));
  console.log(chalk.gray(`API Endpoint: ${getApiEndpoint(config)}`));
  console.log(chalk.gray(`Config: ~/.ccrank/config.json`));
  console.log(chalk.gray(`Mode: Public (no API key required)`));

  console.log('Available commands:');
  console.log(chalk.cyan('  ccrank sync') + '          - Sync current stats');
  console.log(chalk.cyan('  ccrank sync --stdin') + '  - Sync from piped JSON');
  console.log(chalk.cyan('  ccrank logout') + '        - Clear credentials\n');
}

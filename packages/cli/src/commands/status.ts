/**
 * Status command - show current authentication status
 */

import chalk from 'chalk';
import { readConfig, getApiEndpoint } from '../config';

/**
 * Status command handler
 */
export async function statusCommand(): Promise<void> {
  const config = readConfig();

  console.log(chalk.bold('\nccrank Status\n'));

  if (!config || !config.apiKey) {
    console.log(chalk.yellow('Status: Not configured'));
    console.log(chalk.gray('\nRun this command to set up:'));
    console.log(chalk.cyan('  ccrank setup <api-key>\n'));
    return;
  }

  console.log(chalk.green('Status: Configured'));
  console.log(chalk.gray(`\nUsername: ${config.username || 'Not set'}`));
  console.log(chalk.gray(`API Endpoint: ${getApiEndpoint(config)}`));
  console.log(chalk.gray(`Config: ~/.ccrank/config.json`));

  // Show masked API key
  const maskedKey = config.apiKey.slice(0, 8) + '...' + config.apiKey.slice(-4);
  console.log(chalk.gray(`API Key: ${maskedKey}\n`));

  console.log('Available commands:');
  console.log(chalk.cyan('  ccrank sync') + '          - Sync current stats');
  console.log(chalk.cyan('  ccrank sync --stdin') + '  - Sync from piped JSON');
  console.log(chalk.cyan('  ccrank logout') + '        - Clear credentials\n');
}

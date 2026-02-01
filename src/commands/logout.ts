/**
 * Logout command - clear stored credentials
 */

import chalk from 'chalk';
import { clearConfig, readConfig } from '../config';

/**
 * Logout command handler
 */
export async function logoutCommand(): Promise<void> {
  const config = readConfig();

  if (!config || !config.apiKey) {
    console.log(chalk.yellow('\nYou are not configured.\n'));
    return;
  }

  clearConfig();
  console.log(chalk.green('\n✓ Logged out successfully'));
  console.log(chalk.gray('Credentials cleared from ~/.ccrank/config.json\n'));
}

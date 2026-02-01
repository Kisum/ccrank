/**
 * Setup command - configure API key and install Claude Code hook
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import { writeConfig, getApiEndpoint } from '../config';

const CLAUDE_SETTINGS_DIR = path.join(os.homedir(), '.claude');
const CLAUDE_SETTINGS_FILE = path.join(CLAUDE_SETTINGS_DIR, 'settings.json');

interface ClaudeSettings {
  hooks?: {
    SessionEnd?: Array<{
      type: string;
      command: string;
      timeout?: number;
    }>;
  };
  [key: string]: any;
}

/**
 * Validate API key by calling the API
 */
async function validateApiKeyWithServer(apiKey: string, apiEndpoint: string): Promise<{ valid: boolean; username?: string; error?: string }> {
  try {
    const response = await axios.post(
      apiEndpoint,
      { entries: [], source: 'ccusage', version: '1.0.0' },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ccrank/1.0.0',
        },
        timeout: 10000,
      }
    );

    // If we get here, the API key is valid
    return {
      valid: true,
      username: response.data?.username || response.data?.user?.name || 'User'
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      } else if (error.response?.status === 403) {
        return { valid: false, error: 'API key does not have permission' };
      } else if (error.response) {
        // Other response errors - might still mean valid auth
        return {
          valid: true,
          username: error.response.data?.username || 'User'
        };
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return { valid: false, error: 'Could not connect to API server' };
      }
    }
    return { valid: false, error: 'Failed to validate API key' };
  }
}

/**
 * Read Claude settings file
 */
function readClaudeSettings(): ClaudeSettings {
  try {
    if (!fs.existsSync(CLAUDE_SETTINGS_FILE)) {
      return {};
    }
    const data = fs.readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If file exists but is invalid JSON, start fresh
    return {};
  }
}

/**
 * Write Claude settings file
 */
function writeClaudeSettings(settings: ClaudeSettings): void {
  // Ensure directory exists
  if (!fs.existsSync(CLAUDE_SETTINGS_DIR)) {
    fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(
    CLAUDE_SETTINGS_FILE,
    JSON.stringify(settings, null, 2),
    { mode: 0o600 }
  );
}

/**
 * Install the Claude Code SessionEnd hook
 */
function installClaudeHook(username: string): { installed: boolean; alreadyExists: boolean } {
  const settings = readClaudeSettings();

  // Initialize hooks structure if needed
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.SessionEnd) {
    settings.hooks.SessionEnd = [];
  }

  // Check if hook already exists (check for any ccrank sync command)
  const existingHookIndex = settings.hooks.SessionEnd.findIndex(
    hook => hook.command.includes('ccrank sync')
  );

  // New hook command with embedded username
  const hookCommand = `npx github:Kisum/ccrank sync --quiet --user ${username}`;

  if (existingHookIndex >= 0) {
    // Update existing hook with new command
    settings.hooks.SessionEnd[existingHookIndex] = {
      type: 'command',
      command: hookCommand,
      timeout: 30,
    };
    writeClaudeSettings(settings);
    return { installed: true, alreadyExists: true };
  }

  // Add the hook
  settings.hooks.SessionEnd.push({
    type: 'command',
    command: hookCommand,
    timeout: 30,
  });

  writeClaudeSettings(settings);
  return { installed: true, alreadyExists: false };
}

/**
 * Setup command handler
 * Accepts either a username (simple setup) or API key (authenticated setup)
 */
export async function setupCommand(usernameOrApiKey: string): Promise<void> {
  const spinner = ora();

  console.log(chalk.bold('\nccrank Setup\n'));

  if (!usernameOrApiKey || usernameOrApiKey.trim().length === 0) {
    console.error(chalk.red('Error: Username is required.\n'));
    console.log('Usage: ccrank setup <username>\n');
    process.exit(1);
  }

  try {
    // Determine if this is a username or API key
    // API keys are typically long (20+ chars) and contain special patterns
    const isApiKey = usernameOrApiKey.length >= 20 && /[A-Za-z0-9_-]{20,}/.test(usernameOrApiKey);

    let username: string;
    let apiKey: string | undefined;

    if (isApiKey) {
      // Legacy API key flow
      spinner.start('Validating API key...');
      const apiEndpoint = getApiEndpoint(null);
      const validation = await validateApiKeyWithServer(usernameOrApiKey, apiEndpoint);

      if (!validation.valid) {
        spinner.fail(`API key validation failed: ${validation.error}`);
        process.exit(1);
      }
      spinner.succeed('API key validated');
      username = validation.username || 'User';
      apiKey = usernameOrApiKey;
    } else {
      // Simple username flow
      username = usernameOrApiKey.trim();
      spinner.succeed(`Username set to: ${username}`);
    }

    // Save configuration
    spinner.start('Saving configuration...');
    writeConfig({
      apiKey: apiKey || `user_${username}`, // Use placeholder for username-only auth
      username,
    });
    spinner.succeed('Configuration saved to ~/.ccrank/config.json');

    // Install Claude Code hook
    spinner.start('Installing Claude Code hook...');
    const hookResult = installClaudeHook(username);

    if (hookResult.alreadyExists) {
      spinner.succeed('Claude Code hook updated');
    } else {
      spinner.succeed('Claude Code hook installed');
    }

    // Success message
    console.log(chalk.green('\n✓ Setup completed successfully!\n'));
    console.log(chalk.gray(`  Username: ${username}`));
    console.log(chalk.gray(`  Config: ~/.ccrank/config.json`));
    console.log(chalk.gray(`  Hook: ~/.claude/settings.json\n`));

    console.log('Your Claude Code usage will now be synced automatically after each session.');
    console.log('You can also manually sync anytime with:');
    console.log(chalk.cyan('  ccrank sync\n'));

  } catch (error) {
    spinner.fail('Setup failed');
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`));
    process.exit(1);
  }
}

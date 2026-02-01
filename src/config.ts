/**
 * Configuration management for ccrank
 * Handles reading/writing config to ~/.ccrank/config.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from './types';

const CONFIG_DIR = path.join(os.homedir(), '.ccrank');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Default API endpoint (can be overridden in config)
const DEFAULT_API_ENDPOINT = 'https://ccusageshare-leaderboard.vercel.app/api/sync';

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read configuration from disk
 */
export function readConfig(): Config | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to read config: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Write configuration to disk
 */
export function writeConfig(config: Config): void {
  try {
    ensureConfigDir();
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(config, null, 2),
      { mode: 0o600 }
    );
  } catch (error) {
    throw new Error(`Failed to write config: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get API endpoint from config or use default
 */
export function getApiEndpoint(config: Config | null): string {
  return config?.apiEndpoint || DEFAULT_API_ENDPOINT;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const config = readConfig();
  return config !== null && !!config.apiKey;
}

/**
 * Get config or throw if not authenticated
 */
export function requireAuth(): Config {
  const config = readConfig();
  if (!config || !config.apiKey) {
    throw new Error('Not authenticated. Please run: ccrank setup <api-key>');
  }
  return config;
}

/**
 * Clear configuration (logout)
 */
export function clearConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}

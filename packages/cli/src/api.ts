/**
 * API client for communicating with the leaderboard backend
 */

import axios, { AxiosError } from 'axios';
import { SyncPayload, SyncResponse, LeaderboardEntry } from './types';

const PACKAGE_VERSION = '1.0.0';

/**
 * Sync leaderboard entries to the API
 */
export async function syncToLeaderboard(
  entries: LeaderboardEntry[],
  apiKey: string,
  apiEndpoint: string
): Promise<SyncResponse> {
  const payload: SyncPayload = {
    entries,
    source: 'ccusage',
    version: PACKAGE_VERSION,
  };

  try {
    const response = await axios.post<SyncResponse>(apiEndpoint, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': `ccrank/${PACKAGE_VERSION}`,
      },
      timeout: 30000, // 30 second timeout
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<any>;

      if (axiosError.response) {
        // Server responded with error status
        const status = axiosError.response.status;
        const message = axiosError.response.data?.message || axiosError.message;

        if (status === 401) {
          throw new Error('Authentication failed. Please check your API key.');
        } else if (status === 403) {
          throw new Error('Access forbidden. Your API key may not have permission.');
        } else if (status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else if (status >= 500) {
          throw new Error(`Server error: ${message}`);
        } else {
          throw new Error(`API error (${status}): ${message}`);
        }
      } else if (axiosError.request) {
        // Request made but no response received
        throw new Error('No response from server. Please check your network connection.');
      }
    }

    throw new Error(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate API key format
 */
export function validateApiKey(apiKey: string): boolean {
  // API keys should be non-empty and reasonable length
  return apiKey.length >= 20 && apiKey.length <= 256;
}

/**
 * Test API connection and authentication
 */
export async function testConnection(
  apiKey: string,
  apiEndpoint: string
): Promise<boolean> {
  try {
    // Send empty sync to test authentication
    await syncToLeaderboard([], apiKey, apiEndpoint);
    return true;
  } catch (error) {
    return false;
  }
}

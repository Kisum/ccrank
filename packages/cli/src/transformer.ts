/**
 * Transform ccusage data into leaderboard entries
 */

import { CCUsageOutput, LeaderboardEntry } from './types';

/**
 * Convert a local date string (YYYY-MM-DD) to UTC date string
 * accounting for the current timezone offset.
 */
function localDateToUtcDate(localDate: string): string {
  // Parse the local date and add current time
  const [year, month, day] = localDate.split('-').map(Number);
  // Create date at noon local time to avoid DST edge cases
  const localDateTime = new Date(year, month - 1, day, 12, 0, 0);
  // Convert to UTC date string
  return localDateTime.toISOString().split('T')[0];
}

/**
 * Transform ccusage daily data into leaderboard entries
 */
export function transformToLeaderboardEntries(
  ccusageData: CCUsageOutput,
  username: string
): LeaderboardEntry[] {
  const timezoneOffset = new Date().getTimezoneOffset(); // Minutes offset from UTC

  return ccusageData.daily.map(day => ({
    username,
    date: day.date, // Keep original local date for display
    utcDate: localDateToUtcDate(day.date), // Add UTC date for accurate comparisons
    timezoneOffset,
    totalTokens: day.totalTokens,
    totalCost: day.totalCost,
    inputTokens: day.inputTokens,
    outputTokens: day.outputTokens,
    cacheCreationTokens: day.cacheCreationTokens,
    cacheReadTokens: day.cacheReadTokens,
    modelsUsed: day.modelsUsed,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Validate ccusage output structure
 */
export function validateCCUsageData(data: any): data is CCUsageOutput {
  if (!data || typeof data !== 'object') {
    return false;
  }

  if (!Array.isArray(data.daily)) {
    return false;
  }

  // Validate at least one daily entry has required fields
  if (data.daily.length > 0) {
    const first = data.daily[0];
    const requiredFields = [
      'date',
      'inputTokens',
      'outputTokens',
      'totalTokens',
      'totalCost',
      'modelsUsed'
    ];

    for (const field of requiredFields) {
      if (!(field in first)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get summary statistics from ccusage data
 */
export function getSummaryStats(data: CCUsageOutput) {
  const summary = data.summary || calculateSummary(data.daily);
  return {
    totalDays: data.daily.length,
    totalCost: summary.totalCost,
    totalTokens: summary.totalTokens,
    uniqueModels: summary.uniqueModels.length,
  };
}

/**
 * Calculate summary if not provided
 */
function calculateSummary(daily: any[]) {
  const uniqueModelsSet = new Set<string>();

  const totals = daily.reduce(
    (acc, day) => {
      day.modelsUsed.forEach((model: string) => uniqueModelsSet.add(model));
      return {
        totalInputTokens: acc.totalInputTokens + day.inputTokens,
        totalOutputTokens: acc.totalOutputTokens + day.outputTokens,
        totalCacheCreationTokens: acc.totalCacheCreationTokens + day.cacheCreationTokens,
        totalCacheReadTokens: acc.totalCacheReadTokens + day.cacheReadTokens,
        totalTokens: acc.totalTokens + day.totalTokens,
        totalCost: acc.totalCost + day.totalCost,
      };
    },
    {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalTokens: 0,
      totalCost: 0,
    }
  );

  return {
    ...totals,
    uniqueModels: Array.from(uniqueModelsSet),
  };
}

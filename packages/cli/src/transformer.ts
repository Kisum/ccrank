/**
 * Transform ccusage data into leaderboard entries
 */

import { CCUsageOutput, LeaderboardEntry } from './types';

/**
 * Transform ccusage daily data into leaderboard entries
 */
export function transformToLeaderboardEntries(
  ccusageData: CCUsageOutput,
  username: string
): LeaderboardEntry[] {
  return ccusageData.daily.map(day => ({
    username,
    date: day.date,
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

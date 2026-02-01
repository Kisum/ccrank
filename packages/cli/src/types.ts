/**
 * Types for ccusage data structures and API interactions
 */

export interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

export interface CCUsageOutput {
  daily: DailyUsage[];
  summary?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheCreationTokens: number;
    totalCacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    uniqueModels: string[];
  };
}

export interface Config {
  apiKey: string;
  apiEndpoint?: string;
  username?: string;
}

export interface LeaderboardEntry {
  username: string;
  date: string;
  totalTokens: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelsUsed: string[];
  timestamp: string;
}

export interface SyncPayload {
  entries: LeaderboardEntry[];
  source: 'ccusage';
  version: string;
}

export interface SyncResponse {
  success: boolean;
  message: string;
  entriesProcessed: number;
  leaderboardUrl?: string;
}

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table - one record per user across all workspaces
  users: defineTable({
    slackUserId: v.string(),
    slackTeamId: v.string(),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slack_user", ["slackUserId", "slackTeamId"])
    .index("by_team", ["slackTeamId"])
    .index("by_created_at", ["createdAt"]),

  // API keys for CLI authentication
  apiKeys: defineTable({
    userId: v.id("users"),
    keyHash: v.string(), // Store hashed version of the API key
    keyPrefix: v.string(), // First 8 chars for identification (e.g., "ccus_abc")
    name: v.optional(v.string()), // Optional name for the key
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_key_hash", ["keyHash"])
    .index("by_key_prefix", ["keyPrefix"])
    .index("by_active", ["isActive", "userId"]),

  // Slack workspace installations
  slackWorkspaces: defineTable({
    teamId: v.string(),
    teamName: v.string(),
    botToken: v.string(), // Encrypted bot token
    botUserId: v.string(),
    scope: v.string(),
    installedBy: v.string(), // Slack user ID who installed
    installedAt: v.number(),
    isActive: v.boolean(),
  })
    .index("by_team_id", ["teamId"])
    .index("by_active", ["isActive"]),

  // Daily usage stats - granular tracking
  dailyStats: defineTable({
    userId: v.id("users"),
    date: v.string(), // ISO date string: "YYYY-MM-DD"
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheCreationTokens: v.number(),
    cacheReadTokens: v.number(),
    totalCost: v.number(), // In cents or smallest currency unit
    requestCount: v.number(), // Number of API requests
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_date", ["date"])
    .index("by_date_cost", ["date", "totalCost"])
    .index("by_date_tokens", ["date", "inputTokens"]),

  // Weekly aggregates - pre-computed for performance
  weeklyStats: defineTable({
    userId: v.id("users"),
    weekStart: v.string(), // ISO date string of Monday: "YYYY-MM-DD"
    year: v.number(),
    weekNumber: v.number(), // ISO week number (1-53)
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheCreationTokens: v.number(),
    cacheReadTokens: v.number(),
    totalCost: v.number(),
    requestCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_week", ["userId", "weekStart"])
    .index("by_week", ["weekStart"])
    .index("by_week_cost", ["weekStart", "totalCost"])
    .index("by_year_week", ["year", "weekNumber"]),

  // Monthly aggregates - pre-computed for performance
  monthlyStats: defineTable({
    userId: v.id("users"),
    month: v.string(), // "YYYY-MM"
    year: v.number(),
    monthNumber: v.number(), // 1-12
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheCreationTokens: v.number(),
    cacheReadTokens: v.number(),
    totalCost: v.number(),
    requestCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_month", ["userId", "month"])
    .index("by_month", ["month"])
    .index("by_month_cost", ["month", "totalCost"])
    .index("by_year_month", ["year", "monthNumber"]),

  // All-time stats - continuously updated
  allTimeStats: defineTable({
    userId: v.id("users"),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheCreationTokens: v.number(),
    cacheReadTokens: v.number(),
    totalCost: v.number(),
    requestCount: v.number(),
    firstActivityAt: v.number(),
    lastActivityAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_total_cost", ["totalCost"])
    .index("by_input_tokens", ["inputTokens"])
    .index("by_output_tokens", ["outputTokens"])
    .index("by_last_activity", ["lastActivityAt"]),

  // Usage events - raw event log for audit trail
  usageEvents: defineTable({
    userId: v.id("users"),
    timestamp: v.number(),
    date: v.string(), // "YYYY-MM-DD" for easy daily queries
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheCreationTokens: v.number(),
    cacheReadTokens: v.number(),
    cost: v.number(),
    model: v.optional(v.string()), // e.g., "claude-sonnet-4-5"
    metadata: v.optional(
      v.object({
        // Flexible metadata
        sessionId: v.optional(v.string()),
        clientVersion: v.optional(v.string()),
        platform: v.optional(v.string()),
      })
    ),
  })
    .index("by_user_timestamp", ["userId", "timestamp"])
    .index("by_date", ["date"])
    .index("by_user_date", ["userId", "date"])
    .index("by_timestamp", ["timestamp"]),

  // Leaderboard snapshots - cached rankings for performance
  leaderboardSnapshots: defineTable({
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("allTime")
    ),
    periodKey: v.string(), // "YYYY-MM-DD", "YYYY-WW", "YYYY-MM", or "allTime"
    metric: v.union(
      v.literal("totalCost"),
      v.literal("inputTokens"),
      v.literal("outputTokens"),
      v.literal("totalTokens")
    ),
    rankings: v.array(
      v.object({
        userId: v.id("users"),
        rank: v.number(),
        value: v.number(),
        displayName: v.string(),
        avatarUrl: v.optional(v.string()),
      })
    ),
    teamId: v.optional(v.string()), // Optional: team-specific leaderboard
    generatedAt: v.number(),
    ttl: v.number(), // Time to live - when to regenerate
  })
    .index("by_period_key_metric", ["period", "periodKey", "metric"])
    .index("by_team_period", ["teamId", "period", "periodKey"])
    .index("by_ttl", ["ttl"]),

  // Workspace-specific settings
  workspaceSettings: defineTable({
    teamId: v.string(),
    settings: v.object({
      leaderboardEnabled: v.boolean(),
      publicLeaderboard: v.boolean(),
      allowedChannels: v.optional(v.array(v.string())),
      excludedUsers: v.optional(v.array(v.string())),
      customMessage: v.optional(v.string()),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_team_id", ["teamId"]),

  // Achievements/badges system (optional, for gamification)
  achievements: defineTable({
    userId: v.id("users"),
    type: v.string(), // e.g., "first_million_tokens", "top_10_week"
    unlockedAt: v.number(),
    metadata: v.optional(
      v.object({
        value: v.optional(v.number()),
        rank: v.optional(v.number()),
        period: v.optional(v.string()),
      })
    ),
  })
    .index("by_user", ["userId"])
    .index("by_type", ["type"])
    .index("by_unlocked_at", ["unlockedAt"]),
});

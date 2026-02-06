import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users registered via Slack or GitHub OAuth
  users: defineTable({
    slackUserId: v.string(),
    slackTeamId: v.string(),
    displayName: v.optional(v.string()),
    githubId: v.optional(v.string()), // GitHub user ID for OAuth users
    githubUsername: v.optional(v.string()), // GitHub username
    createdAt: v.number(),
  })
    .index("by_slack_id", ["slackUserId", "slackTeamId"])
    .index("by_team", ["slackTeamId"])
    .index("by_github_id", ["githubId"]),

  // Daily usage statistics for each user
  dailyStats: defineTable({
    userId: v.id("users"),
    date: v.string(), // YYYY-MM-DD format (user's local timezone, for display)
    utcDate: v.optional(v.string()), // YYYY-MM-DD format (UTC, for accurate comparisons)
    timezoneOffset: v.optional(v.number()), // Minutes offset from UTC (e.g., -480 for PST)
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheCreationTokens: v.number(),
    cacheReadTokens: v.number(),
    totalTokens: v.number(),
    totalCost: v.number(),
    modelsUsed: v.array(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_user_utc_date", ["userId", "utcDate"])
    .index("by_date", ["date"])
    .index("by_utc_date", ["utcDate"])
    .index("by_user", ["userId"]),

  // API keys for CLI authentication
  apiKeys: defineTable({
    userId: v.id("users"),
    keyHash: v.string(),
    keyPrefix: v.string(), // First 8 chars for identification
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["keyHash"])
    .index("by_prefix", ["keyPrefix"]),

  // Insights reports uploaded by users
  insightsReports: defineTable({
    userId: v.id("users"),
    reportHtml: v.string(),
    uploadedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Slack workspace installations
  slackWorkspaces: defineTable({
    teamId: v.string(),
    teamName: v.string(),
    botToken: v.string(),
    installedAt: v.number(),
  }).index("by_team_id", ["teamId"]),
});

import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

// Helper type for leaderboard entry
type LeaderboardEntry = {
  userId: Id<"users">;
  displayName: string | undefined;
  slackUserId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  rank: number;
};

// Helper to get tomorrow's date (for inclusive end range with timezone buffer)
function getTomorrow(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().split("T")[0];
}

// Helper to get date N days ago (with 1 day buffer for timezone handling)
function getDaysAgo(days: number): string {
  const date = new Date();
  // Add 1 extra day buffer for timezone edge cases
  date.setUTCDate(date.getUTCDate() - days - 1);
  return date.toISOString().split("T")[0];
}

// Helper to get the effective date for filtering (prefer utcDate, fallback to date)
function getEffectiveDate(stat: Doc<"dailyStats">): string {
  return stat.utcDate ?? stat.date;
}

// Helper to aggregate stats and build leaderboard
async function buildLeaderboard(
  ctx: QueryCtx,
  startDate: string,
  endDate: string,
  teamId?: string
): Promise<LeaderboardEntry[]> {
  // Get all daily stats in the date range
  const allStats = await ctx.db.query("dailyStats").collect();

  // Filter by date range using UTC date when available (for accurate cross-timezone comparisons)
  const filteredStats = allStats.filter((s: Doc<"dailyStats">) => {
    const effectiveDate = getEffectiveDate(s);
    return effectiveDate >= startDate && effectiveDate <= endDate;
  });

  // Group stats by userId and aggregate
  const userAggregates = new Map<
    Id<"users">,
    {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      totalTokens: number;
      totalCost: number;
      modelsUsed: Set<string>;
    }
  >();

  for (const stat of filteredStats) {
    const existing = userAggregates.get(stat.userId);
    if (existing) {
      existing.inputTokens += stat.inputTokens;
      existing.outputTokens += stat.outputTokens;
      existing.cacheCreationTokens += stat.cacheCreationTokens;
      existing.cacheReadTokens += stat.cacheReadTokens;
      existing.totalTokens += stat.totalTokens;
      existing.totalCost += stat.totalCost;
      for (const model of stat.modelsUsed) {
        existing.modelsUsed.add(model);
      }
    } else {
      userAggregates.set(stat.userId, {
        inputTokens: stat.inputTokens,
        outputTokens: stat.outputTokens,
        cacheCreationTokens: stat.cacheCreationTokens,
        cacheReadTokens: stat.cacheReadTokens,
        totalTokens: stat.totalTokens,
        totalCost: stat.totalCost,
        modelsUsed: new Set(stat.modelsUsed),
      });
    }
  }

  // Convert to array with user info
  const leaderboard: LeaderboardEntry[] = [];

  for (const [userId, aggregate] of userAggregates) {
    const user = await ctx.db.get(userId);
    if (!user) continue;

    // Filter by team if specified
    if (teamId && user.slackTeamId !== teamId) continue;

    leaderboard.push({
      userId,
      displayName: user.displayName,
      slackUserId: user.slackUserId,
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
      cacheCreationTokens: aggregate.cacheCreationTokens,
      cacheReadTokens: aggregate.cacheReadTokens,
      totalTokens: aggregate.totalTokens,
      totalCost: aggregate.totalCost,
      modelsUsed: Array.from(aggregate.modelsUsed),
      rank: 0, // Will be set after sorting
    });
  }

  // Sort by total cost (descending)
  leaderboard.sort((a, b) => b.totalCost - a.totalCost);

  // Assign ranks
  leaderboard.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return leaderboard;
}

/**
 * Get last 24 hours leaderboard (rolling 1-day window).
 * Uses expanded date range for timezone handling.
 */
export const getDailyLeaderboard = query({
  args: {
    teamId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const startDate = getDaysAgo(1);
    const endDate = getTomorrow();
    const leaderboard = await buildLeaderboard(ctx, startDate, endDate, args.teamId);

    if (args.limit) {
      return leaderboard.slice(0, args.limit);
    }
    return leaderboard;
  },
});

/**
 * Get last 7 days leaderboard (rolling 7-day window).
 */
export const getWeeklyLeaderboard = query({
  args: {
    teamId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const startDate = getDaysAgo(7);
    const endDate = getTomorrow();
    const leaderboard = await buildLeaderboard(
      ctx,
      startDate,
      endDate,
      args.teamId
    );

    if (args.limit) {
      return leaderboard.slice(0, args.limit);
    }
    return leaderboard;
  },
});

/**
 * Get last 30 days leaderboard (rolling 30-day window).
 */
export const getMonthlyLeaderboard = query({
  args: {
    teamId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const startDate = getDaysAgo(30);
    const endDate = getTomorrow();
    const leaderboard = await buildLeaderboard(
      ctx,
      startDate,
      endDate,
      args.teamId
    );

    if (args.limit) {
      return leaderboard.slice(0, args.limit);
    }
    return leaderboard;
  },
});

/**
 * Get all-time leaderboard.
 */
export const getAllTimeLeaderboard = query({
  args: {
    teamId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Use a very old start date and tomorrow for timezone buffer
    const leaderboard = await buildLeaderboard(
      ctx,
      "2000-01-01",
      getTomorrow(),
      args.teamId
    );

    if (args.limit) {
      return leaderboard.slice(0, args.limit);
    }
    return leaderboard;
  },
});

/**
 * Get a specific user's rank for different time periods.
 */
export const getUserRank = query({
  args: {
    userId: v.id("users"),
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("allTime")
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    let startDate: string;
    let endDate: string;
    const tomorrow = getTomorrow();

    switch (args.period) {
      case "daily":
        startDate = getDaysAgo(1);
        endDate = tomorrow;
        break;
      case "weekly":
        startDate = getDaysAgo(7);
        endDate = tomorrow;
        break;
      case "monthly":
        startDate = getDaysAgo(30);
        endDate = tomorrow;
        break;
      case "allTime":
        startDate = "2000-01-01";
        endDate = tomorrow;
        break;
    }

    // Build leaderboard for user's team
    const leaderboard = await buildLeaderboard(
      ctx,
      startDate,
      endDate,
      user.slackTeamId
    );

    // Find user's entry
    const userEntry = leaderboard.find((entry) => entry.userId === args.userId);

    if (!userEntry) {
      return {
        rank: null,
        totalParticipants: leaderboard.length,
        stats: null,
      };
    }

    return {
      rank: userEntry.rank,
      totalParticipants: leaderboard.length,
      stats: {
        inputTokens: userEntry.inputTokens,
        outputTokens: userEntry.outputTokens,
        cacheCreationTokens: userEntry.cacheCreationTokens,
        cacheReadTokens: userEntry.cacheReadTokens,
        totalTokens: userEntry.totalTokens,
        totalCost: userEntry.totalCost,
        modelsUsed: userEntry.modelsUsed,
      },
    };
  },
});

/**
 * Get leaderboard for a custom date range.
 */
export const getLeaderboardByDateRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    teamId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const leaderboard = await buildLeaderboard(
      ctx,
      args.startDate,
      args.endDate,
      args.teamId
    );

    if (args.limit) {
      return leaderboard.slice(0, args.limit);
    }
    return leaderboard;
  },
});

/**
 * Get stats summary for a specific period.
 */
export const getStatsSummary = query({
  args: {
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("alltime")
    ),
  },
  handler: async (ctx, args) => {
    let startDate: string;
    let endDate: string;
    const tomorrow = getTomorrow();

    switch (args.period) {
      case "daily":
        startDate = getDaysAgo(1);
        endDate = tomorrow;
        break;
      case "weekly":
        startDate = getDaysAgo(7);
        endDate = tomorrow;
        break;
      case "monthly":
        startDate = getDaysAgo(30);
        endDate = tomorrow;
        break;
      case "alltime":
        startDate = "2000-01-01";
        endDate = tomorrow;
        break;
    }

    // Get all daily stats in the date range
    const allStats = await ctx.db.query("dailyStats").collect();

    // Filter by date range using UTC date when available (with timezone buffer)
    const filteredStats = allStats.filter((s: Doc<"dailyStats">) => {
      const effectiveDate = getEffectiveDate(s);
      return effectiveDate >= startDate && effectiveDate <= endDate;
    });

    // Calculate totals
    let totalTokens = 0;
    let totalCost = 0;
    const uniqueUsers = new Set<string>();

    for (const stat of filteredStats) {
      totalTokens += stat.totalTokens;
      totalCost += stat.totalCost;
      uniqueUsers.add(stat.userId);
    }

    return {
      totalTokens,
      totalCost,
      totalUsers: uniqueUsers.size,
      period: args.period,
    };
  },
});

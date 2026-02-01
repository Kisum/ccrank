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

// Helper to get today's date in YYYY-MM-DD format (UTC)
function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

// Helper to get start of current week (Monday) in UTC
function getWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust so Monday is start
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  return monday.toISOString().split("T")[0];
}

// Helper to get start of current month in UTC
function getMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .split("T")[0];
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
 * Get today's leaderboard.
 * Uses UTC date for accurate cross-timezone comparisons.
 */
export const getDailyLeaderboard = query({
  args: {
    teamId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const today = getToday();
    const leaderboard = await buildLeaderboard(ctx, today, today, args.teamId);

    if (args.limit) {
      return leaderboard.slice(0, args.limit);
    }
    return leaderboard;
  },
});

/**
 * Get current week's leaderboard.
 */
export const getWeeklyLeaderboard = query({
  args: {
    teamId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const weekStart = getWeekStart();
    const today = getToday();
    const leaderboard = await buildLeaderboard(
      ctx,
      weekStart,
      today,
      args.teamId
    );

    if (args.limit) {
      return leaderboard.slice(0, args.limit);
    }
    return leaderboard;
  },
});

/**
 * Get current month's leaderboard.
 */
export const getMonthlyLeaderboard = query({
  args: {
    teamId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const monthStart = getMonthStart();
    const today = getToday();
    const leaderboard = await buildLeaderboard(
      ctx,
      monthStart,
      today,
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
    // Use a very old start date to get all stats
    const leaderboard = await buildLeaderboard(
      ctx,
      "2000-01-01",
      getToday(),
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
    const today = getToday();

    switch (args.period) {
      case "daily":
        startDate = today;
        break;
      case "weekly":
        startDate = getWeekStart();
        break;
      case "monthly":
        startDate = getMonthStart();
        break;
      case "allTime":
        startDate = "2000-01-01";
        break;
    }

    // Build leaderboard for user's team
    const leaderboard = await buildLeaderboard(
      ctx,
      startDate,
      today,
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
    const today = getToday();

    switch (args.period) {
      case "daily":
        startDate = today;
        break;
      case "weekly":
        startDate = getWeekStart();
        break;
      case "monthly":
        startDate = getMonthStart();
        break;
      case "alltime":
        startDate = "2000-01-01";
        break;
    }

    // Get all daily stats in the date range
    const allStats = await ctx.db.query("dailyStats").collect();

    // Filter by date range using UTC date when available
    const filteredStats = allStats.filter((s: Doc<"dailyStats">) => {
      const effectiveDate = getEffectiveDate(s);
      return effectiveDate >= startDate && effectiveDate <= today;
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

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
  rankChange: number | "new" | null;
  lastSyncedAt: number | null;
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

// Helper to get the Monday of the ISO week for a given date string (YYYY-MM-DD)
function getISOWeekMonday(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  const day = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday offset
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().split("T")[0];
}

// Helper to get the first day of the month for a given date string (YYYY-MM-DD)
function getMonthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

// Helper to compute the bucket key for a date string given a bucketBy mode
function getBucketKey(dateStr: string, bucketBy: "day" | "week" | "month"): string {
  switch (bucketBy) {
    case "day":
      return dateStr;
    case "week":
      return getISOWeekMonday(dateStr);
    case "month":
      return getMonthStart(dateStr);
  }
}

// Helper to map time range to number of days (null = no limit)
function getTimeRangeDays(timeRange: "30d" | "90d" | "6m" | "1y" | "all"): number | null {
  switch (timeRange) {
    case "30d": return 30;
    case "90d": return 90;
    case "6m": return 180;
    case "1y": return 365;
    case "all": return null; // no limit
  }
}

// Helper to get date range for a bucketBy mode
function getBucketDateRange(bucketBy: "day" | "week" | "month"): { startDate: string; endDate: string } {
  const endDate = getTomorrow();
  switch (bucketBy) {
    case "day":
      return { startDate: getDaysAgo(30), endDate };
    case "week":
      return { startDate: getDaysAgo(84), endDate };
    case "month":
      return { startDate: getDaysAgo(365), endDate };
  }
}

// Fetch all daily stats once (to avoid multiple DB scans)
async function fetchAllStats(ctx: QueryCtx): Promise<Doc<"dailyStats">[]> {
  return ctx.db.query("dailyStats").collect();
}

// Build leaderboard from pre-fetched stats for a given date range.
// Uses batched user lookups via Promise.all instead of sequential awaits.
async function buildLeaderboardFromStats(
  ctx: QueryCtx,
  allStats: Doc<"dailyStats">[],
  startDate: string,
  endDate: string,
  teamId?: string
): Promise<LeaderboardEntry[]> {
  // Filter by date range using UTC date when available
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
      lastSyncedAt: number;
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
      if (stat.updatedAt > existing.lastSyncedAt) {
        existing.lastSyncedAt = stat.updatedAt;
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
        lastSyncedAt: stat.updatedAt,
      });
    }
  }

  // Batch user lookups with Promise.all instead of sequential awaits
  const userIds = Array.from(userAggregates.keys());
  const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
  const userMap = new Map<Id<"users">, Doc<"users">>();
  userIds.forEach((id, i) => {
    if (users[i]) userMap.set(id, users[i]!);
  });

  // Convert to array with user info
  const leaderboard: LeaderboardEntry[] = [];

  for (const [userId, aggregate] of userAggregates) {
    const user = userMap.get(userId);
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
      rankChange: null, // Will be set by computeRankChanges
      lastSyncedAt: aggregate.lastSyncedAt,
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

// Compute rank changes between current and previous period leaderboards
function computeRankChanges(
  current: LeaderboardEntry[],
  previous: LeaderboardEntry[]
): void {
  const previousRankMap = new Map<string, number>();
  for (const entry of previous) {
    previousRankMap.set(entry.userId, entry.rank);
  }

  for (const entry of current) {
    const prevRank = previousRankMap.get(entry.userId);
    if (prevRank === undefined) {
      entry.rankChange = "new";
    } else {
      entry.rankChange = prevRank - entry.rank; // positive = moved up
    }
  }
}

// Helper to aggregate stats and build leaderboard (wrapper for unchanged callers)
async function buildLeaderboard(
  ctx: QueryCtx,
  startDate: string,
  endDate: string,
  teamId?: string
): Promise<LeaderboardEntry[]> {
  const allStats = await fetchAllStats(ctx);
  return buildLeaderboardFromStats(ctx, allStats, startDate, endDate, teamId);
}

// Helper to get period date ranges for leaderboard queries
function getPeriodDateRanges(period: "daily" | "weekly" | "monthly" | "alltime"): {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
  hasPrevious: boolean;
} {
  const endDate = getTomorrow();
  switch (period) {
    case "daily":
      return {
        currentStart: getDaysAgo(1),
        currentEnd: endDate,
        previousStart: getDaysAgo(3),
        previousEnd: getDaysAgo(1),
        hasPrevious: true,
      };
    case "weekly":
      return {
        currentStart: getDaysAgo(7),
        currentEnd: endDate,
        previousStart: getDaysAgo(14),
        previousEnd: getDaysAgo(7),
        hasPrevious: true,
      };
    case "monthly":
      return {
        currentStart: getDaysAgo(30),
        currentEnd: endDate,
        previousStart: getDaysAgo(60),
        previousEnd: getDaysAgo(30),
        hasPrevious: true,
      };
    case "alltime":
      return {
        currentStart: "2000-01-01",
        currentEnd: endDate,
        previousStart: "2000-01-01",
        previousEnd: "2000-01-01",
        hasPrevious: false,
      };
  }
}

// Helper to compute stats summary from pre-fetched stats for a date range
function computeStatsSummary(
  allStats: Doc<"dailyStats">[],
  startDate: string,
  endDate: string,
  period: string
): { totalTokens: number; totalCost: number; totalUsers: number; period: string } {
  let totalTokens = 0;
  let totalCost = 0;
  const uniqueUsers = new Set<string>();

  for (const stat of allStats) {
    const effectiveDate = getEffectiveDate(stat);
    if (effectiveDate >= startDate && effectiveDate <= endDate) {
      totalTokens += stat.totalTokens;
      totalCost += stat.totalCost;
      uniqueUsers.add(stat.userId);
    }
  }

  return {
    totalTokens,
    totalCost,
    totalUsers: uniqueUsers.size,
    period,
  };
}

/**
 * Combined query for the main page: returns both stats summary and leaderboard
 * in a single DB scan, avoiding redundant fetchAllStats calls.
 */
export const getPageData = query({
  args: {
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("alltime")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Single DB scan for all stats
    const allStats = await fetchAllStats(ctx);

    const ranges = getPeriodDateRanges(args.period);

    // Build stats summary from the fetched data
    const statsSummary = computeStatsSummary(
      allStats,
      ranges.currentStart,
      ranges.currentEnd,
      args.period
    );

    // Build current period leaderboard
    const current = await buildLeaderboardFromStats(
      ctx,
      allStats,
      ranges.currentStart,
      ranges.currentEnd
    );

    // Compute rank changes if there's a previous period
    if (ranges.hasPrevious) {
      const previous = await buildLeaderboardFromStats(
        ctx,
        allStats,
        ranges.previousStart,
        ranges.previousEnd
      );
      computeRankChanges(current, previous);
    }

    const leaderboard = args.limit ? current.slice(0, args.limit) : current;

    // Check which users have insights reports
    const reports = await ctx.db.query("insightsReports").collect();
    const reportUserIds = new Set(reports.map((r) => r.userId));

    const leaderboardWithReports = leaderboard.map((entry) => ({
      ...entry,
      hasReport: reportUserIds.has(entry.userId),
    }));

    return { statsSummary, leaderboard: leaderboardWithReports };
  },
});

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
    const allStats = await fetchAllStats(ctx);
    const endDate = getTomorrow();

    const current = await buildLeaderboardFromStats(ctx, allStats, getDaysAgo(1), endDate, args.teamId);
    const previous = await buildLeaderboardFromStats(ctx, allStats, getDaysAgo(3), getDaysAgo(1), args.teamId);
    computeRankChanges(current, previous);

    if (args.limit) {
      return current.slice(0, args.limit);
    }
    return current;
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
    const allStats = await fetchAllStats(ctx);
    const endDate = getTomorrow();

    const current = await buildLeaderboardFromStats(ctx, allStats, getDaysAgo(7), endDate, args.teamId);
    const previous = await buildLeaderboardFromStats(ctx, allStats, getDaysAgo(14), getDaysAgo(7), args.teamId);
    computeRankChanges(current, previous);

    if (args.limit) {
      return current.slice(0, args.limit);
    }
    return current;
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
    const allStats = await fetchAllStats(ctx);
    const endDate = getTomorrow();

    const current = await buildLeaderboardFromStats(ctx, allStats, getDaysAgo(30), endDate, args.teamId);
    const previous = await buildLeaderboardFromStats(ctx, allStats, getDaysAgo(60), getDaysAgo(30), args.teamId);
    computeRankChanges(current, previous);

    if (args.limit) {
      return current.slice(0, args.limit);
    }
    return current;
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
    // All-time has no previous period comparison, rankChange stays null
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
 * Get daily usage data for chart visualization.
 * Returns aggregated usage per day for the specified period.
 */
export const getDailyUsageChart = query({
  args: {
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("alltime")
    ),
    bucketBy: v.optional(v.union(v.literal("day"), v.literal("week"), v.literal("month"))),
    timeRange: v.optional(v.union(
      v.literal("30d"),
      v.literal("90d"),
      v.literal("6m"),
      v.literal("1y"),
      v.literal("all")
    )),
  },
  handler: async (ctx, args) => {
    let startDate: string;
    let endDate: string;

    if (args.timeRange) {
      // timeRange takes priority for determining date range
      const days = getTimeRangeDays(args.timeRange);
      startDate = days !== null ? getDaysAgo(days) : "2000-01-01";
      endDate = getTomorrow();
    } else if (args.bucketBy) {
      // When bucketBy is provided, use its own date range
      const range = getBucketDateRange(args.bucketBy);
      startDate = range.startDate;
      endDate = range.endDate;
    } else {
      // Original period-based behavior
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
          startDate = getDaysAgo(90); // Limit to last 90 days for chart readability
          endDate = tomorrow;
          break;
      }
    }

    // Get all daily stats in the date range
    const allStats = await ctx.db.query("dailyStats").collect();

    // Filter by date range using UTC date when available
    const filteredStats = allStats.filter((s: Doc<"dailyStats">) => {
      const effectiveDate = getEffectiveDate(s);
      return effectiveDate >= startDate && effectiveDate <= endDate;
    });

    // Group stats by date and aggregate
    const dailyAggregates = new Map<
      string,
      {
        totalTokens: number;
        totalCost: number;
        uniqueUsers: Set<string>;
      }
    >();

    for (const stat of filteredStats) {
      const effectiveDate = getEffectiveDate(stat);
      const existing = dailyAggregates.get(effectiveDate);
      if (existing) {
        existing.totalTokens += stat.totalTokens;
        existing.totalCost += stat.totalCost;
        existing.uniqueUsers.add(stat.userId);
      } else {
        dailyAggregates.set(effectiveDate, {
          totalTokens: stat.totalTokens,
          totalCost: stat.totalCost,
          uniqueUsers: new Set([stat.userId]),
        });
      }
    }

    // Bucketing step: aggregate dailyAggregates into buckets if bucketBy is provided
    let finalAggregates: Map<string, { totalTokens: number; totalCost: number; uniqueUsers: Set<string> }>;
    if (args.bucketBy && args.bucketBy !== "day") {
      finalAggregates = new Map();
      for (const [dateStr, data] of dailyAggregates) {
        const bucketKey = getBucketKey(dateStr, args.bucketBy);
        const existing = finalAggregates.get(bucketKey);
        if (existing) {
          existing.totalTokens += data.totalTokens;
          existing.totalCost += data.totalCost;
          for (const user of data.uniqueUsers) {
            existing.uniqueUsers.add(user);
          }
        } else {
          finalAggregates.set(bucketKey, {
            totalTokens: data.totalTokens,
            totalCost: data.totalCost,
            uniqueUsers: new Set(data.uniqueUsers),
          });
        }
      }
    } else {
      finalAggregates = dailyAggregates;
    }

    // Convert to sorted array
    const chartData = Array.from(finalAggregates.entries())
      .map(([date, data]) => ({
        date,
        totalTokens: data.totalTokens,
        totalCost: Math.round(data.totalCost * 100) / 100, // Round to 2 decimals
        activeUsers: data.uniqueUsers.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return chartData;
  },
});

/**
 * Get per-user daily usage data for line chart visualization.
 * Returns time-series data with each top user as a separate series.
 */
export const getUserDailyUsageChart = query({
  args: {
    period: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("alltime")
    ),
    topN: v.optional(v.number()),
    bucketBy: v.optional(v.union(v.literal("day"), v.literal("week"), v.literal("month"))),
    timeRange: v.optional(v.union(
      v.literal("30d"),
      v.literal("90d"),
      v.literal("6m"),
      v.literal("1y"),
      v.literal("all")
    )),
  },
  handler: async (ctx, args) => {
    const maxUsers = args.topN ?? 10;

    let startDate: string;
    let endDate: string;

    if (args.timeRange) {
      // timeRange takes priority for determining date range
      const days = getTimeRangeDays(args.timeRange);
      startDate = days !== null ? getDaysAgo(days) : "2000-01-01";
      endDate = getTomorrow();
    } else if (args.bucketBy) {
      // When bucketBy is provided, use its own date range
      const range = getBucketDateRange(args.bucketBy);
      startDate = range.startDate;
      endDate = range.endDate;
    } else {
      // Original period-based behavior
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
          startDate = getDaysAgo(90);
          endDate = tomorrow;
          break;
      }
    }

    // Get all daily stats in the date range
    const allStats = await ctx.db.query("dailyStats").collect();

    const filteredStats = allStats.filter((s: Doc<"dailyStats">) => {
      const effectiveDate = getEffectiveDate(s);
      return effectiveDate >= startDate && effectiveDate <= endDate;
    });

    // Find top N users by total cost in this period
    const userTotals = new Map<Id<"users">, number>();
    for (const stat of filteredStats) {
      const existing = userTotals.get(stat.userId) ?? 0;
      userTotals.set(stat.userId, existing + stat.totalCost);
    }

    const topUserIds = Array.from(userTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxUsers)
      .map(([userId]) => userId);

    const topUserIdSet = new Set(topUserIds);

    // Batch user lookups with Promise.all instead of sequential awaits
    const topUsers = await Promise.all(topUserIds.map((id) => ctx.db.get(id)));
    const userNames = new Map<Id<"users">, string>();
    topUserIds.forEach((userId, i) => {
      const user = topUsers[i];
      if (user) {
        const name = user.displayName ?? `User ${user.slackUserId.slice(-4)}`;
        // Sanitize: only alphanumeric, hyphens, underscores
        const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 39) || "unknown";
        userNames.set(userId, sanitized);
      }
    });

    // Build per-date, per-user cost map
    const dateUserCosts = new Map<string, Map<Id<"users">, number>>();
    for (const stat of filteredStats) {
      if (!topUserIdSet.has(stat.userId)) continue;
      const effectiveDate = getEffectiveDate(stat);
      if (!dateUserCosts.has(effectiveDate)) {
        dateUserCosts.set(effectiveDate, new Map());
      }
      const dayMap = dateUserCosts.get(effectiveDate)!;
      const existing = dayMap.get(stat.userId) ?? 0;
      dayMap.set(stat.userId, existing + stat.totalCost);
    }

    // Bucketing step: aggregate dateUserCosts into buckets if bucketBy is provided
    let finalDateUserCosts: Map<string, Map<Id<"users">, number>>;
    if (args.bucketBy && args.bucketBy !== "day") {
      finalDateUserCosts = new Map();
      for (const [dateStr, userCostMap] of dateUserCosts) {
        const bucketKey = getBucketKey(dateStr, args.bucketBy);
        if (!finalDateUserCosts.has(bucketKey)) {
          finalDateUserCosts.set(bucketKey, new Map());
        }
        const bucketMap = finalDateUserCosts.get(bucketKey)!;
        for (const [userId, cost] of userCostMap) {
          const existing = bucketMap.get(userId) ?? 0;
          bucketMap.set(userId, existing + cost);
        }
      }
    } else {
      finalDateUserCosts = dateUserCosts;
    }

    // Build sorted chart data
    const dates = Array.from(finalDateUserCosts.keys()).sort();
    const chartData = dates.map((date) => {
      const dayMap = finalDateUserCosts.get(date)!;
      const entry: Record<string, string | number> = { date };
      for (const userId of topUserIds) {
        const name = userNames.get(userId) ?? "unknown";
        const cost = dayMap.get(userId) ?? 0;
        entry[name] = Math.round(cost * 100) / 100;
      }
      return entry;
    });

    // Return users list (ordered by total cost) and chart data
    const users = topUserIds.map((userId) => ({
      userId,
      displayName: userNames.get(userId) ?? "unknown",
    }));

    return { users, chartData };
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

    return computeStatsSummary(allStats, startDate, endDate, args.period);
  },
});

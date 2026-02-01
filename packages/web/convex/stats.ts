import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Record or update daily stats for a user.
 * Uses upsert pattern - updates existing record or creates new one.
 */
export const recordDailyStats = mutation({
  args: {
    userId: v.id("users"),
    date: v.string(), // YYYY-MM-DD format
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheCreationTokens: v.number(),
    cacheReadTokens: v.number(),
    totalTokens: v.number(),
    totalCost: v.number(),
    modelsUsed: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if stats already exist for this user+date
    const existingStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date)
      )
      .unique();

    if (existingStats) {
      // Update existing record
      await ctx.db.patch(existingStats._id, {
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        cacheCreationTokens: args.cacheCreationTokens,
        cacheReadTokens: args.cacheReadTokens,
        totalTokens: args.totalTokens,
        totalCost: args.totalCost,
        modelsUsed: args.modelsUsed,
        updatedAt: Date.now(),
      });
      return existingStats._id;
    }

    // Create new record
    const statsId = await ctx.db.insert("dailyStats", {
      userId: args.userId,
      date: args.date,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cacheCreationTokens: args.cacheCreationTokens,
      cacheReadTokens: args.cacheReadTokens,
      totalTokens: args.totalTokens,
      totalCost: args.totalCost,
      modelsUsed: args.modelsUsed,
      updatedAt: Date.now(),
    });

    return statsId;
  },
});

/**
 * Get user stats for a date range.
 */
export const getUserStats = query({
  args: {
    userId: v.id("users"),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Filter by date range
    const filteredStats = stats.filter(
      (s) => s.date >= args.startDate && s.date <= args.endDate
    );

    // Sort by date ascending
    filteredStats.sort((a, b) => a.date.localeCompare(b.date));

    return filteredStats;
  },
});

/**
 * Get all stats for a specific date.
 */
export const getStatsByDate = query({
  args: {
    date: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    return stats;
  },
});

/**
 * Batch record stats for multiple days.
 * Useful for syncing historical data.
 */
export const batchRecordStats = mutation({
  args: {
    userId: v.id("users"),
    stats: v.array(
      v.object({
        date: v.string(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        cacheCreationTokens: v.number(),
        cacheReadTokens: v.number(),
        totalTokens: v.number(),
        totalCost: v.number(),
        modelsUsed: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results: string[] = [];
    const now = Date.now();

    for (const stat of args.stats) {
      // Check if stats already exist for this user+date
      const existingStats = await ctx.db
        .query("dailyStats")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", args.userId).eq("date", stat.date)
        )
        .unique();

      if (existingStats) {
        // Update existing record
        await ctx.db.patch(existingStats._id, {
          inputTokens: stat.inputTokens,
          outputTokens: stat.outputTokens,
          cacheCreationTokens: stat.cacheCreationTokens,
          cacheReadTokens: stat.cacheReadTokens,
          totalTokens: stat.totalTokens,
          totalCost: stat.totalCost,
          modelsUsed: stat.modelsUsed,
          updatedAt: now,
        });
        results.push(`updated:${stat.date}`);
      } else {
        // Create new record
        await ctx.db.insert("dailyStats", {
          userId: args.userId,
          date: stat.date,
          inputTokens: stat.inputTokens,
          outputTokens: stat.outputTokens,
          cacheCreationTokens: stat.cacheCreationTokens,
          cacheReadTokens: stat.cacheReadTokens,
          totalTokens: stat.totalTokens,
          totalCost: stat.totalCost,
          modelsUsed: stat.modelsUsed,
          updatedAt: now,
        });
        results.push(`created:${stat.date}`);
      }
    }

    return { success: true, results };
  },
});

/**
 * Get aggregate stats for a user over a date range.
 */
export const getUserAggregateStats = query({
  args: {
    userId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Filter by date range
    const filteredStats = stats.filter(
      (s) => s.date >= args.startDate && s.date <= args.endDate
    );

    // Aggregate
    const aggregate = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      modelsUsed: new Set<string>(),
      daysActive: filteredStats.length,
    };

    for (const stat of filteredStats) {
      aggregate.inputTokens += stat.inputTokens;
      aggregate.outputTokens += stat.outputTokens;
      aggregate.cacheCreationTokens += stat.cacheCreationTokens;
      aggregate.cacheReadTokens += stat.cacheReadTokens;
      aggregate.totalTokens += stat.totalTokens;
      aggregate.totalCost += stat.totalCost;
      for (const model of stat.modelsUsed) {
        aggregate.modelsUsed.add(model);
      }
    }

    return {
      ...aggregate,
      modelsUsed: Array.from(aggregate.modelsUsed),
    };
  },
});

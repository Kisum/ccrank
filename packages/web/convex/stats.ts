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
 * Deletes all existing stats for the user and replaces with new data.
 * This ensures the database always mirrors the user's local data exactly.
 */
export const batchRecordStats = mutation({
  args: {
    userId: v.id("users"),
    stats: v.array(
      v.object({
        date: v.string(), // User's local date (YYYY-MM-DD)
        utcDate: v.optional(v.string()), // UTC date (YYYY-MM-DD)
        timezoneOffset: v.optional(v.number()), // Minutes offset from UTC
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
    const now = Date.now();

    // Delete all existing stats for this user
    const existingStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const stat of existingStats) {
      await ctx.db.delete(stat._id);
    }

    // Insert all new stats
    for (const stat of args.stats) {
      await ctx.db.insert("dailyStats", {
        userId: args.userId,
        date: stat.date,
        utcDate: stat.utcDate,
        timezoneOffset: stat.timezoneOffset,
        inputTokens: stat.inputTokens,
        outputTokens: stat.outputTokens,
        cacheCreationTokens: stat.cacheCreationTokens,
        cacheReadTokens: stat.cacheReadTokens,
        totalTokens: stat.totalTokens,
        totalCost: stat.totalCost,
        modelsUsed: stat.modelsUsed,
        updatedAt: now,
      });
    }

    return {
      success: true,
      deleted: existingStats.length,
      inserted: args.stats.length,
    };
  },
});

/**
 * Delete all stats for a user by display name.
 * Used for cleanup of test data.
 */
export const deleteStatsByDisplayName = mutation({
  args: {
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    // Find user by display name
    const users = await ctx.db.query("users").collect();
    const user = users.find((u) => u.displayName === args.displayName);

    if (!user) {
      return { success: false, error: "User not found", deleted: 0 };
    }

    // Get all stats for this user
    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Delete each stat
    for (const stat of stats) {
      await ctx.db.delete(stat._id);
    }

    return { success: true, deleted: stats.length, userId: user._id };
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

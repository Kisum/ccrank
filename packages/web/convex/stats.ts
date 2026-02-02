import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Maximum reasonable values for validation
const MAX_DAILY_TOKENS = 1_000_000_000; // 1B tokens per day
const MAX_DAILY_COST = 100_000; // $100,000 per day

/**
 * Validate stats entry values are within reasonable bounds.
 */
function validateStatsEntry(entry: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
}): { valid: boolean; error?: string } {
  // Check for negative values
  if (entry.inputTokens < 0 || entry.outputTokens < 0 ||
      entry.cacheCreationTokens < 0 || entry.cacheReadTokens < 0 ||
      entry.totalTokens < 0 || entry.totalCost < 0) {
    return { valid: false, error: "Token counts and costs cannot be negative" };
  }

  // Check for unreasonably large values
  if (entry.totalTokens > MAX_DAILY_TOKENS) {
    return { valid: false, error: `Total tokens exceeds maximum allowed (${MAX_DAILY_TOKENS})` };
  }

  if (entry.totalCost > MAX_DAILY_COST) {
    return { valid: false, error: `Total cost exceeds maximum allowed ($${MAX_DAILY_COST})` };
  }

  return { valid: true };
}

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
    // Validate all stats entries before processing
    for (const stat of args.stats) {
      const validation = validateStatsEntry(stat);
      if (!validation.valid) {
        throw new Error(`Invalid stats entry for ${stat.date}: ${validation.error}`);
      }
    }

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
 * Clean up fake/malicious users and their stats.
 * Removes users with XSS attempts, ridiculous values, or suspicious patterns.
 */
export const cleanupFakeData = mutation({
  args: {},
  handler: async (ctx) => {
    // Patterns that indicate XSS attempts or malicious usernames
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /onclick/i,
      /onerror/i,
      /onload/i,
      /<svg/i,
      /<img/i,
      /\.\.\//,  // Path traversal
      /alert\(/i,
      /eval\(/i,
    ];

    const allUsers = await ctx.db.query("users").collect();
    const deletedUsers: string[] = [];
    const deletedStats: number[] = [];

    for (const user of allUsers) {
      let shouldDelete = false;
      const displayName = user.displayName || "";

      // Check for suspicious username patterns
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(displayName)) {
          shouldDelete = true;
          break;
        }
      }

      // Check for ridiculous stats (tokens > 10B or cost > $100k total)
      if (!shouldDelete) {
        const userStats = await ctx.db
          .query("dailyStats")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();

        let totalTokens = 0;
        let totalCost = 0;

        for (const stat of userStats) {
          totalTokens += stat.totalTokens;
          totalCost += stat.totalCost;
        }

        // Flag if total tokens > 10B or cost > $100k (these are absurd for any real user)
        if (totalTokens > 10_000_000_000 || totalCost > 100_000) {
          shouldDelete = true;
        }

        // Also flag if any single stat entry is ridiculous
        for (const stat of userStats) {
          if (stat.totalTokens > MAX_DAILY_TOKENS || stat.totalCost > MAX_DAILY_COST) {
            shouldDelete = true;
            break;
          }
          // Flag negative values
          if (stat.totalTokens < 0 || stat.totalCost < 0) {
            shouldDelete = true;
            break;
          }
        }
      }

      if (shouldDelete) {
        // Delete all stats for this user
        const userStats = await ctx.db
          .query("dailyStats")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();

        for (const stat of userStats) {
          await ctx.db.delete(stat._id);
        }
        deletedStats.push(userStats.length);

        // Delete any API keys for this user
        const userKeys = await ctx.db
          .query("apiKeys")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();

        for (const key of userKeys) {
          await ctx.db.delete(key._id);
        }

        // Delete the user
        await ctx.db.delete(user._id);
        deletedUsers.push(displayName);
      }
    }

    return {
      success: true,
      deletedUsers,
      deletedUsersCount: deletedUsers.length,
      totalStatsDeleted: deletedStats.reduce((a, b) => a + b, 0),
    };
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

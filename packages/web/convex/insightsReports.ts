import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Upload or update an insights report for a user.
 */
export const uploadInsightsReport = mutation({
  args: {
    userId: v.id("users"),
    reportHtml: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if user already has a report
    const existing = await ctx.db
      .query("insightsReports")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        reportHtml: args.reportHtml,
        uploadedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("insightsReports", {
      userId: args.userId,
      reportHtml: args.reportHtml,
      uploadedAt: Date.now(),
    });
  },
});

/**
 * Get a user's insights report by username (for the public report page).
 */
export const getInsightsReportByUsername = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the user by displayName or githubUsername
    const allUsers = await ctx.db.query("users").collect();
    const user = allUsers.find(
      (u) =>
        u.displayName?.toLowerCase() === args.username.toLowerCase() ||
        u.githubUsername?.toLowerCase() === args.username.toLowerCase()
    );

    if (!user) return null;

    const report = await ctx.db
      .query("insightsReports")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (!report) return null;

    return {
      reportHtml: report.reportHtml,
      uploadedAt: report.uploadedAt,
      displayName: user.displayName,
    };
  },
});

/**
 * Get the set of user IDs that have uploaded insights reports.
 * Used by the leaderboard to show report buttons.
 */
export const getUserIdsWithReports = query({
  handler: async (ctx) => {
    const reports = await ctx.db.query("insightsReports").collect();
    return reports.map((r) => r.userId);
  },
});

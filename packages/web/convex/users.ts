import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get or create a user from Slack data.
 * If user exists, returns existing user. Otherwise creates a new user.
 */
export const getOrCreateUser = mutation({
  args: {
    slackUserId: v.string(),
    slackTeamId: v.string(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_slack_id", (q) =>
        q.eq("slackUserId", args.slackUserId).eq("slackTeamId", args.slackTeamId)
      )
      .unique();

    if (existingUser) {
      // Update display name if provided and different
      if (args.displayName && args.displayName !== existingUser.displayName) {
        await ctx.db.patch(existingUser._id, {
          displayName: args.displayName,
        });
      }
      return existingUser._id;
    }

    // Create new user
    const userId = await ctx.db.insert("users", {
      slackUserId: args.slackUserId,
      slackTeamId: args.slackTeamId,
      displayName: args.displayName,
      createdAt: Date.now(),
    });

    return userId;
  },
});

/**
 * Get a user by their Slack ID and team ID.
 */
export const getUserBySlackId = query({
  args: {
    slackUserId: v.string(),
    slackTeamId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_slack_id", (q) =>
        q.eq("slackUserId", args.slackUserId).eq("slackTeamId", args.slackTeamId)
      )
      .unique();

    return user;
  },
});

/**
 * Get a user by their Convex document ID.
 */
export const getUserById = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user;
  },
});

/**
 * Get all users in a workspace/team.
 */
export const getUsersByTeam = query({
  args: {
    slackTeamId: v.string(),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_team", (q) => q.eq("slackTeamId", args.slackTeamId))
      .collect();

    return users;
  },
});

/**
 * Update a user's display name.
 */
export const updateDisplayName = mutation({
  args: {
    userId: v.id("users"),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      displayName: args.displayName,
    });
  },
});

/**
 * Get or create a user from GitHub OAuth data.
 * Also merges any existing "web" user with the same display name.
 */
export const getOrCreateGitHubUser = mutation({
  args: {
    githubId: v.string(),
    githubUsername: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if user already exists by GitHub ID
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_github_id", (q) => q.eq("githubId", args.githubId))
      .unique();

    if (existingUser) {
      // Update username if changed
      if (args.githubUsername !== existingUser.githubUsername) {
        await ctx.db.patch(existingUser._id, {
          githubUsername: args.githubUsername,
          displayName: args.githubUsername,
        });
      }
      return existingUser._id;
    }

    // Check if there's an old "web" user with the same display name
    // that we should upgrade to a GitHub user instead of creating a duplicate
    const allUsers = await ctx.db.query("users").collect();
    const oldWebUser = allUsers.find(
      (u) =>
        u.slackTeamId === "web" &&
        u.displayName?.toLowerCase() === args.githubUsername.toLowerCase()
    );

    if (oldWebUser) {
      // Upgrade the old web user to a GitHub user
      await ctx.db.patch(oldWebUser._id, {
        slackUserId: `github_${args.githubId}`,
        slackTeamId: "github",
        githubId: args.githubId,
        githubUsername: args.githubUsername,
        displayName: args.githubUsername,
      });
      return oldWebUser._id;
    }

    // Create new user with GitHub OAuth identity
    const userId = await ctx.db.insert("users", {
      slackUserId: `github_${args.githubId}`,
      slackTeamId: "github",
      displayName: args.githubUsername,
      githubId: args.githubId,
      githubUsername: args.githubUsername,
      createdAt: Date.now(),
    });

    return userId;
  },
});

/**
 * Merge duplicate users with the same display name.
 * Keeps the GitHub user (if exists) and merges stats from web user into it.
 */
export const mergeDuplicateUsers = mutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    const merged: string[] = [];

    // Group users by lowercase display name
    const byName = new Map<string, typeof allUsers>();
    for (const user of allUsers) {
      const name = (user.displayName || "").toLowerCase();
      if (!name) continue;
      const list = byName.get(name) || [];
      list.push(user);
      byName.set(name, list);
    }

    // Process duplicates
    for (const [name, users] of byName) {
      if (users.length <= 1) continue;

      // Prefer GitHub user, then the newest user
      const githubUser = users.find((u) => u.slackTeamId === "github");
      const primaryUser = githubUser || users.sort((a, b) => b.createdAt - a.createdAt)[0];
      const duplicates = users.filter((u) => u._id !== primaryUser._id);

      for (const dup of duplicates) {
        // Move all stats from duplicate to primary user
        const dupStats = await ctx.db
          .query("dailyStats")
          .withIndex("by_user", (q) => q.eq("userId", dup._id))
          .collect();

        for (const stat of dupStats) {
          // Check if primary already has stats for this date
          const existingStat = await ctx.db
            .query("dailyStats")
            .withIndex("by_user_date", (q) =>
              q.eq("userId", primaryUser._id).eq("date", stat.date)
            )
            .unique();

          if (existingStat) {
            // Merge by keeping the higher values
            await ctx.db.patch(existingStat._id, {
              inputTokens: Math.max(existingStat.inputTokens, stat.inputTokens),
              outputTokens: Math.max(existingStat.outputTokens, stat.outputTokens),
              cacheCreationTokens: Math.max(existingStat.cacheCreationTokens, stat.cacheCreationTokens),
              cacheReadTokens: Math.max(existingStat.cacheReadTokens, stat.cacheReadTokens),
              totalTokens: Math.max(existingStat.totalTokens, stat.totalTokens),
              totalCost: Math.max(existingStat.totalCost, stat.totalCost),
            });
            await ctx.db.delete(stat._id);
          } else {
            // Move stat to primary user
            await ctx.db.patch(stat._id, { userId: primaryUser._id });
          }
        }

        // Delete duplicate user's API keys
        const dupKeys = await ctx.db
          .query("apiKeys")
          .withIndex("by_user", (q) => q.eq("userId", dup._id))
          .collect();
        for (const key of dupKeys) {
          await ctx.db.delete(key._id);
        }

        // Delete the duplicate user
        await ctx.db.delete(dup._id);
        merged.push(`${dup.displayName} (${dup.slackTeamId})`);
      }
    }

    return { merged, count: merged.length };
  },
});

/**
 * Get a user by their GitHub ID.
 */
export const getUserByGitHubId = query({
  args: {
    githubId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_github_id", (q) => q.eq("githubId", args.githubId))
      .unique();

    return user;
  },
});

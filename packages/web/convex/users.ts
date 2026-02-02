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

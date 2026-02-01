import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Save a Slack workspace after OAuth installation.
 * Updates existing workspace or creates new one.
 */
export const saveWorkspace = mutation({
  args: {
    teamId: v.string(),
    teamName: v.string(),
    botToken: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if workspace already exists
    const existingWorkspace = await ctx.db
      .query("slackWorkspaces")
      .withIndex("by_team_id", (q) => q.eq("teamId", args.teamId))
      .unique();

    if (existingWorkspace) {
      // Update existing workspace
      await ctx.db.patch(existingWorkspace._id, {
        teamName: args.teamName,
        botToken: args.botToken,
        installedAt: Date.now(),
      });
      return existingWorkspace._id;
    }

    // Create new workspace
    const workspaceId = await ctx.db.insert("slackWorkspaces", {
      teamId: args.teamId,
      teamName: args.teamName,
      botToken: args.botToken,
      installedAt: Date.now(),
    });

    return workspaceId;
  },
});

/**
 * Get a Slack workspace by team ID.
 */
export const getWorkspace = query({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("slackWorkspaces")
      .withIndex("by_team_id", (q) => q.eq("teamId", args.teamId))
      .unique();

    return workspace;
  },
});

/**
 * Get workspace by document ID.
 */
export const getWorkspaceById = query({
  args: {
    workspaceId: v.id("slackWorkspaces"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.workspaceId);
  },
});

/**
 * List all installed workspaces.
 */
export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const workspaces = await ctx.db.query("slackWorkspaces").collect();

    // Don't return bot tokens in list view
    return workspaces.map((w) => ({
      _id: w._id,
      teamId: w.teamId,
      teamName: w.teamName,
      installedAt: w.installedAt,
    }));
  },
});

/**
 * Remove a workspace (uninstall).
 */
export const removeWorkspace = mutation({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("slackWorkspaces")
      .withIndex("by_team_id", (q) => q.eq("teamId", args.teamId))
      .unique();

    if (!workspace) {
      throw new Error("Workspace not found");
    }

    await ctx.db.delete(workspace._id);

    return { success: true };
  },
});

/**
 * Update workspace name.
 */
export const updateWorkspaceName = mutation({
  args: {
    teamId: v.string(),
    teamName: v.string(),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("slackWorkspaces")
      .withIndex("by_team_id", (q) => q.eq("teamId", args.teamId))
      .unique();

    if (!workspace) {
      throw new Error("Workspace not found");
    }

    await ctx.db.patch(workspace._id, {
      teamName: args.teamName,
    });

    return { success: true };
  },
});

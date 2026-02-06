import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Generate a new API key for a user.
 * Returns the full key only once - store it securely!
 * The key is hashed before storage.
 */
export const generateApiKey = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Generate a random API key
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    const fullKey = Array.from(keyBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Create key prefix for identification (first 8 chars)
    const keyPrefix = fullKey.substring(0, 8);

    // Hash the key for storage
    const encoder = new TextEncoder();
    const data = encoder.encode(fullKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Revoke any existing active keys for this user
    const existingKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const now = Date.now();
    for (const key of existingKeys) {
      if (!key.revokedAt) {
        await ctx.db.patch(key._id, { revokedAt: now });
      }
    }

    // Create new API key record
    const keyId = await ctx.db.insert("apiKeys", {
      userId: args.userId,
      keyHash,
      keyPrefix,
      createdAt: now,
    });

    // Return the full key - this is the only time it's available!
    return {
      keyId,
      apiKey: `ccrank_${fullKey}`,
      keyPrefix,
    };
  },
});

/**
 * Create a new API key with a pre-computed hash.
 * Used when the client handles key generation.
 */
export const createApiKey = mutation({
  args: {
    userId: v.id("users"),
    keyHash: v.string(),
    keyPrefix: v.string(),
  },
  handler: async (ctx, args) => {
    // Revoke any existing active keys for this user
    const existingKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const now = Date.now();
    for (const key of existingKeys) {
      if (!key.revokedAt) {
        await ctx.db.patch(key._id, { revokedAt: now });
      }
    }

    // Create new API key
    const keyId = await ctx.db.insert("apiKeys", {
      userId: args.userId,
      keyHash: args.keyHash,
      keyPrefix: args.keyPrefix,
      createdAt: now,
    });

    return keyId;
  },
});

/**
 * Validate an API key and return the associated userId.
 * The key should be passed as the full key (without prefix).
 */
export const validateApiKey = query({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Remove the ccrank_ prefix if present
    const keyValue = args.apiKey.startsWith("ccrank_")
      ? args.apiKey.substring(7)
      : args.apiKey;

    // Hash the provided key
    const encoder = new TextEncoder();
    const data = encoder.encode(keyValue);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Look up the key by hash
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", keyHash))
      .first();

    if (!apiKey || apiKey.revokedAt) {
      return null;
    }

    return {
      userId: apiKey.userId,
      keyPrefix: apiKey.keyPrefix,
    };
  },
});

/**
 * Validate an API key and return the associated user data in one call.
 * Combines key validation + user lookup to avoid a redundant DB round-trip.
 */
export const validateApiKeyWithUser = query({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Remove the ccrank_ prefix if present
    const keyValue = args.apiKey.startsWith("ccrank_")
      ? args.apiKey.substring(7)
      : args.apiKey;

    // Hash the provided key
    const encoder = new TextEncoder();
    const data = encoder.encode(keyValue);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Look up the key by hash
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", keyHash))
      .first();

    if (!apiKey || apiKey.revokedAt) {
      return null;
    }

    // Also fetch the user in the same query
    const user = await ctx.db.get(apiKey.userId);
    if (!user) {
      return null;
    }

    return {
      userId: apiKey.userId,
      keyPrefix: apiKey.keyPrefix,
      user: {
        githubUsername: user.githubUsername,
        displayName: user.displayName,
      },
    };
  },
});

/**
 * Revoke an API key by its ID.
 */
export const revokeApiKey = mutation({
  args: {
    keyId: v.id("apiKeys"),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (!key) {
      throw new Error("API key not found");
    }

    if (key.revokedAt) {
      throw new Error("API key is already revoked");
    }

    await ctx.db.patch(args.keyId, {
      revokedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Get active API key for a user.
 */
export const getActiveKeyForUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Find active key (no revokedAt)
    const activeKey = keys.find((k) => !k.revokedAt);
    return activeKey || null;
  },
});

/**
 * Revoke all API keys for a user.
 */
export const revokeAllKeysForUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const now = Date.now();
    let revokedCount = 0;

    for (const key of keys) {
      if (!key.revokedAt) {
        await ctx.db.patch(key._id, { revokedAt: now });
        revokedCount++;
      }
    }

    return { revokedCount };
  },
});

/**
 * List all API keys for a user (for display purposes).
 * Does not include the actual key values.
 */
export const listKeysForUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return keys.map((key) => ({
      keyId: key._id,
      keyPrefix: key.keyPrefix,
      createdAt: key.createdAt,
      revokedAt: key.revokedAt,
      isActive: !key.revokedAt,
    }));
  },
});

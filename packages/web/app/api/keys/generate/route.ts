import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

/**
 * Generate a new API key for the authenticated user.
 * Requires GitHub OAuth session.
 */
export async function POST() {
  try {
    // Get the authenticated session
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in with GitHub." },
        { status: 401 }
      );
    }

    // Get GitHub username and ID from session
    const user = session.user as { username?: string; githubId?: string; name?: string | null };
    const githubUsername = user.username;
    const githubId = user.githubId;

    if (!githubUsername) {
      return NextResponse.json(
        { error: "GitHub username not found in session" },
        { status: 400 }
      );
    }

    const convex = getConvexClient();

    // Get or create the user in Convex using their GitHub ID
    const userId = await convex.mutation(api.users.getOrCreateGitHubUser, {
      githubId: githubId || githubUsername.toLowerCase(), // Prefer numeric ID, fallback to username
      githubUsername: githubUsername,
    });

    // Generate a new API key for this user
    const keyResult = await convex.mutation(api.apiKeys.generateApiKey, {
      userId,
    });

    return NextResponse.json({
      success: true,
      apiKey: keyResult.apiKey,
      keyPrefix: keyResult.keyPrefix,
      username: githubUsername,
      message: "API key generated successfully. Store it securely - it won't be shown again!",
    });
  } catch (error) {
    console.error("Error generating API key:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate API key" },
      { status: 500 }
    );
  }
}

/**
 * Get the current API key status for the authenticated user.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user as { username?: string; githubId?: string };
    const githubUsername = user.username;
    const githubId = user.githubId;

    if (!githubUsername) {
      return NextResponse.json(
        { error: "GitHub username not found" },
        { status: 400 }
      );
    }

    const convex = getConvexClient();

    // Check if user exists
    const existingUser = await convex.query(api.users.getUserByGitHubId, {
      githubId: githubId || githubUsername.toLowerCase(),
    });

    if (!existingUser) {
      return NextResponse.json({
        hasKey: false,
        username: githubUsername,
      });
    }

    // Check if user has an active API key
    const activeKey = await convex.query(api.apiKeys.getActiveKeyForUser, {
      userId: existingUser._id,
    });

    return NextResponse.json({
      hasKey: !!activeKey,
      keyPrefix: activeKey?.keyPrefix,
      username: githubUsername,
    });
  } catch (error) {
    console.error("Error checking API key:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check API key status" },
      { status: 500 }
    );
  }
}

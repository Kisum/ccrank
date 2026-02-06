import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

const MAX_REPORT_SIZE = 500_000; // 500KB in characters

/**
 * Upload an insights report for the authenticated user.
 * Requires GitHub OAuth session.
 */
export async function POST(request: NextRequest) {
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

    // Parse and validate request body
    const body = await request.json();
    const { reportHtml } = body;

    if (!reportHtml || typeof reportHtml !== "string") {
      return NextResponse.json(
        { error: "reportHtml is required and must be a string" },
        { status: 400 }
      );
    }

    if (reportHtml.length > MAX_REPORT_SIZE) {
      return NextResponse.json(
        { error: `reportHtml exceeds maximum size of ${MAX_REPORT_SIZE} characters` },
        { status: 400 }
      );
    }

    const convex = getConvexClient();

    // Get or create the user in Convex using their GitHub ID
    const userId = await convex.mutation(api.users.getOrCreateGitHubUser, {
      githubId: githubId || githubUsername.toLowerCase(),
      githubUsername: githubUsername,
    });

    // Upload the insights report
    await convex.mutation(api.insightsReports.uploadInsightsReport, {
      userId,
      reportHtml,
    });

    return NextResponse.json({
      success: true,
      message: "Insights report uploaded successfully.",
    });
  } catch (error) {
    console.error("Error uploading insights report:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload insights report" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface StatsEntry {
  date: string; // User's local date (YYYY-MM-DD)
  utcDate?: string; // UTC date (YYYY-MM-DD) for accurate comparisons
  timezoneOffset?: number; // Minutes offset from UTC
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
}

interface SyncRequestBody {
  daily?: StatsEntry[];
  entries?: StatsEntry[];
}

export async function POST(request: NextRequest) {
  try {
    // Get username from query param
    const username = request.nextUrl.searchParams.get("user");
    if (!username) {
      return NextResponse.json(
        { error: "Missing 'user' query parameter" },
        { status: 400 }
      );
    }

    // Parse request body
    let body: SyncRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Accept both 'daily' (ccusage format) and 'entries' (legacy format)
    const entries = body.daily || body.entries;

    if (!entries || !Array.isArray(entries)) {
      return NextResponse.json(
        { error: "Missing or invalid 'daily' or 'entries' array" },
        { status: 400 }
      );
    }

    if (entries.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No entries to sync",
        count: 0,
      });
    }

    // Validate each entry
    for (const entry of entries) {
      if (!entry.date || typeof entry.date !== "string") {
        return NextResponse.json(
          { error: "Each entry must have a valid 'date' string" },
          { status: 400 }
        );
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        return NextResponse.json(
          { error: `Invalid date format: ${entry.date}. Expected YYYY-MM-DD` },
          { status: 400 }
        );
      }
    }

    const convex = getConvexClient();

    // Get or create user by username
    const odId = `user_${username.toLowerCase().replace(/\s+/g, "_")}`;
    const userId = await convex.mutation(api.users.getOrCreateUser, {
      slackUserId: odId,
      slackTeamId: "web",
      displayName: username,
    });

    // Format entries for the Convex mutation
    const statsEntries = entries.map((entry) => ({
      date: entry.date,
      utcDate: entry.utcDate, // May be undefined for legacy data
      timezoneOffset: entry.timezoneOffset, // May be undefined for legacy data
      inputTokens: entry.inputTokens || 0,
      outputTokens: entry.outputTokens || 0,
      cacheCreationTokens: entry.cacheCreationTokens || 0,
      cacheReadTokens: entry.cacheReadTokens || 0,
      totalTokens: entry.totalTokens || 0,
      totalCost: entry.totalCost || 0,
      modelsUsed: entry.modelsUsed || [],
    }));

    // Call the batch record stats mutation
    const result = await convex.mutation(api.stats.batchRecordStats, {
      userId: userId as Id<"users">,
      stats: statsEntries,
    });

    return NextResponse.json({
      success: true,
      message: `Synced ${entries.length} entries for ${username}`,
      count: entries.length,
      results: result.results,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

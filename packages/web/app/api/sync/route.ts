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

/**
 * Convert a local date string to UTC date string given a timezone offset.
 * @param localDate - Date in YYYY-MM-DD format (user's local date)
 * @param tzOffset - Timezone offset string like "+0800" or "-0500"
 */
function localDateToUtcDate(localDate: string, tzOffset: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  // Parse timezone offset (e.g., "+0800" -> +480 minutes, "-0500" -> -300 minutes)
  const sign = tzOffset.startsWith("-") ? -1 : 1;
  const hours = parseInt(tzOffset.slice(-4, -2), 10);
  const minutes = parseInt(tzOffset.slice(-2), 10);
  const offsetMinutes = sign * (hours * 60 + minutes);

  // Create date at noon local time to avoid DST edge cases
  const localDateTime = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  // Subtract offset to get UTC (offset is minutes ahead of UTC)
  localDateTime.setUTCMinutes(localDateTime.getUTCMinutes() - offsetMinutes);
  return localDateTime.toISOString().split("T")[0];
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

    // Get optional timezone offset (e.g., "+0800", "-0500")
    const tzOffset = request.nextUrl.searchParams.get("tz");

    // Parse request body - read raw text first for better error messages
    let body: SyncRequestBody;
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return NextResponse.json(
        { error: "Failed to read request body" },
        { status: 400 }
      );
    }

    // Handle empty body case
    if (!rawBody || rawBody.trim() === "") {
      return NextResponse.json(
        {
          error: "Empty body received - ccusage may not have produced any output. " +
            "Make sure ccusage ran successfully and produced JSON output before piping to curl.",
        },
        { status: 400 }
      );
    }

    // Try to parse JSON, with fallback to extract JSON from mixed content
    try {
      body = JSON.parse(rawBody);
    } catch {
      // Try to find JSON object in the content (npx might print warnings before the JSON)
      const jsonMatch = rawBody.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          body = JSON.parse(jsonMatch[0]);
        } catch {
          const preview = rawBody.slice(0, 100);
          return NextResponse.json(
            {
              error: "Invalid JSON body - found JSON-like content but failed to parse it",
              hint: "Check that ccusage is outputting valid JSON. You may have stderr mixed with stdout.",
              received_preview: preview + (rawBody.length > 100 ? "..." : ""),
            },
            { status: 400 }
          );
        }
      } else {
        const preview = rawBody.slice(0, 100);
        return NextResponse.json(
          {
            error: "Invalid JSON body - no JSON object found in request",
            hint: rawBody.includes("npm") || rawBody.includes("npx")
              ? "It looks like npm/npx output was captured. Try redirecting stderr: npx ccusage@latest --json 2>/dev/null | curl ..."
              : "Make sure ccusage outputs valid JSON. Run 'npx ccusage@latest --json' alone to verify the output.",
            received_preview: preview + (rawBody.length > 100 ? "..." : ""),
          },
          { status: 400 }
        );
      }
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

    // Parse timezone offset to minutes if provided
    let timezoneOffsetMinutes: number | undefined;
    if (tzOffset) {
      const sign = tzOffset.startsWith("-") ? -1 : 1;
      const hours = parseInt(tzOffset.slice(-4, -2), 10);
      const minutes = parseInt(tzOffset.slice(-2), 10);
      timezoneOffsetMinutes = sign * (hours * 60 + minutes);
    }

    // Format entries for the Convex mutation
    const statsEntries = entries.map((entry) => {
      // Compute utcDate if not provided but we have timezone info
      let utcDate = entry.utcDate;
      let timezoneOffset = entry.timezoneOffset;

      if (!utcDate && tzOffset) {
        utcDate = localDateToUtcDate(entry.date, tzOffset);
        timezoneOffset = timezoneOffsetMinutes;
      }

      return {
        date: entry.date,
        utcDate,
        timezoneOffset,
        inputTokens: entry.inputTokens || 0,
        outputTokens: entry.outputTokens || 0,
        cacheCreationTokens: entry.cacheCreationTokens || 0,
        cacheReadTokens: entry.cacheReadTokens || 0,
        totalTokens: entry.totalTokens || 0,
        totalCost: entry.totalCost || 0,
        modelsUsed: entry.modelsUsed || [],
      };
    });

    // Call the batch record stats mutation
    const result = await convex.mutation(api.stats.batchRecordStats, {
      userId: userId as Id<"users">,
      stats: statsEntries,
    });

    return NextResponse.json({
      success: true,
      message: `Synced ${result.inserted} entries for ${username} (replaced ${result.deleted} existing)`,
      count: result.inserted,
      deleted: result.deleted,
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

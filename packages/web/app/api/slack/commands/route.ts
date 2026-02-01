import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import {
  formatLeaderboard,
  formatUserStats,
  formatSetupInstructions,
  sendDM,
  type SlackBlock,
} from "@/lib/slack";
import { getDateRange } from "@/lib/formatters";
import { Id } from "@/convex/_generated/dataModel";

// Verify Slack signature
async function verifySlackRequest(
  request: NextRequest,
  body: string
): Promise<boolean> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("SLACK_SIGNING_SECRET not configured");
    return false;
  }

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!timestamp || !signature) {
    console.error("Missing Slack signature headers");
    return false;
  }

  // Check timestamp to prevent replay attacks (within 5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    console.error("Slack request timestamp too old");
    return false;
  }

  // Create the signature base string
  const sigBasestring = `v0:${timestamp}:${body}`;

  // Compute the signature
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", signingSecret)
      .update(sigBasestring)
      .digest("hex");

  // Compare signatures using timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

// Helper function to send Slack response
function slackResponse(
  blocks: SlackBlock[],
  responseType: "ephemeral" | "in_channel" = "ephemeral"
) {
  return NextResponse.json({
    response_type: responseType,
    blocks,
  });
}

// Helper function to send error response
function errorResponse(message: string) {
  return slackResponse([
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `❌ ${message}`,
      },
    },
  ]);
}

export async function POST(request: NextRequest) {
  try {
    // Read the raw body for signature verification
    const body = await request.text();

    // Verify Slack signature
    const isValid = await verifySlackRequest(request, body);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Parse the form data
    const params = new URLSearchParams(body);
    const text = params.get("text")?.trim() || "";
    const userId = params.get("user_id");
    const teamId = params.get("team_id");
    const userName = params.get("user_name") ?? undefined;

    if (!userId || !teamId) {
      return errorResponse("Missing user or team information");
    }

    // Parse subcommand and arguments
    const [subcommand, ...args] = text.split(/\s+/);
    const normalizedSubcommand = subcommand?.toLowerCase() || "help";

    const convex = getConvexClient();

    switch (normalizedSubcommand) {
      case "setup": {
        // Get or create user
        const userIdResult = await convex.mutation(api.users.getOrCreateUser, {
          slackUserId: userId,
          slackTeamId: teamId,
          displayName: userName,
        });

        // Generate new API key
        const keyResult = await convex.mutation(api.apiKeys.generateApiKey, {
          userId: userIdResult as Id<"users">,
        });

        // Get workspace for bot token
        const workspace = await convex.query(
          api.slack.getWorkspace,
          { teamId }
        );

        if (workspace && workspace.botToken) {
          // Send setup instructions via DM
          const blocks = formatSetupInstructions(keyResult.apiKey);
          const sent = await sendDM(userId, teamId, blocks, workspace.botToken);

          if (sent) {
            return slackResponse([
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "✅ Check your DMs! I've sent you setup instructions with your API key.",
                },
              },
            ]);
          }
        }

        // Fallback: Return instructions in ephemeral message if DM fails
        return slackResponse(formatSetupInstructions(keyResult.apiKey));
      }

      case "leaderboard": {
        // Parse period argument
        const periodArg = args[0]?.toLowerCase();
        let period: "daily" | "weekly" | "monthly" | "alltime" = "weekly";

        if (periodArg === "daily" || periodArg === "today") {
          period = "daily";
        } else if (periodArg === "weekly" || periodArg === "week") {
          period = "weekly";
        } else if (periodArg === "monthly" || periodArg === "month") {
          period = "monthly";
        } else if (periodArg === "alltime" || periodArg === "all") {
          period = "alltime";
        }

        // Get leaderboard data based on period
        type LeaderboardResult = {
          rank: number;
          displayName: string | undefined;
          slackUserId: string;
          totalTokens: number;
          totalCost: number;
        };

        let leaderboard: LeaderboardResult[];
        const queryArgs = { teamId, limit: 10 };

        if (period === "daily") {
          leaderboard = await convex.query(api.leaderboard.getDailyLeaderboard, queryArgs);
        } else if (period === "weekly") {
          leaderboard = await convex.query(api.leaderboard.getWeeklyLeaderboard, queryArgs);
        } else if (period === "monthly") {
          leaderboard = await convex.query(api.leaderboard.getMonthlyLeaderboard, queryArgs);
        } else {
          leaderboard = await convex.query(api.leaderboard.getAllTimeLeaderboard, queryArgs);
        }

        // Format and return
        const blocks = formatLeaderboard(
          leaderboard.map((entry: LeaderboardResult) => ({
            rank: entry.rank,
            username: entry.displayName || `User ${entry.slackUserId.slice(-4)}`,
            slackUserId: entry.slackUserId,
            totalTokens: entry.totalTokens,
            totalCost: entry.totalCost,
          })),
          period
        );

        return slackResponse(blocks, "in_channel");
      }

      case "mystats": {
        // Parse period argument
        const periodArg = args[0]?.toLowerCase();
        let period: "daily" | "weekly" | "monthly" = "weekly";

        if (periodArg === "daily" || periodArg === "today") {
          period = "daily";
        } else if (periodArg === "weekly" || periodArg === "week") {
          period = "weekly";
        } else if (periodArg === "monthly" || periodArg === "month") {
          period = "monthly";
        }

        // Get user
        const user = await convex.query(api.users.getUserBySlackId, {
          slackUserId: userId,
          slackTeamId: teamId,
        });

        if (!user) {
          return slackResponse([
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "You haven't set up ccrank yet! Run `/ccrank setup` to get started.",
              },
            },
          ]);
        }

        // Get date range
        const { startDate, endDate } = getDateRange(period);

        // Get user's aggregate stats
        const stats = await convex.query(api.stats.getUserAggregateStats, {
          userId: user._id as Id<"users">,
          startDate,
          endDate,
        });

        // Get user's rank
        const rankResult = await convex.query(api.leaderboard.getUserRank, {
          userId: user._id as Id<"users">,
          period: period === "daily" ? "daily" : period === "weekly" ? "weekly" : "monthly",
        });

        const userRank = rankResult?.rank ?? 0;
        const totalParticipants = rankResult?.totalParticipants ?? 0;

        const formattedStats =
          stats.totalTokens > 0
            ? {
                rank: userRank || totalParticipants + 1,
                totalParticipants: totalParticipants,
                totalTokens: stats.totalTokens,
                totalCost: stats.totalCost,
                inputTokens: stats.inputTokens,
                outputTokens: stats.outputTokens,
                cacheCreationTokens: stats.cacheCreationTokens,
                cacheReadTokens: stats.cacheReadTokens,
              }
            : null;

        const blocks = formatUserStats(formattedStats, period);
        return slackResponse(blocks);
      }

      case "help":
      default: {
        return slackResponse([
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🏆 Claude Code Leaderboard",
              emoji: true,
            },
          },
          {
            type: "divider",
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Available Commands:*",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "`/ccrank setup` - Get your API key and setup instructions",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "`/ccrank leaderboard [daily|weekly|monthly]` - View the leaderboard",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "`/ccrank mystats [daily|weekly|monthly]` - View your personal stats",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "`/ccrank help` - Show this help message",
            },
          },
        ]);
      }
    }
  } catch (error) {
    console.error("Slack command error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "An unexpected error occurred"
    );
  }
}

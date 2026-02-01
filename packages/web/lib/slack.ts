import crypto from "crypto";
import { formatCost, formatTokens, getRankEmoji, formatPeriod } from "./formatters";

export interface LeaderboardEntry {
  rank: number;
  username: string;
  slackUserId?: string;
  totalTokens: number;
  totalCost: number;
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text?: string;
    emoji?: boolean;
  }>;
  fields?: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * Verify that a request is from Slack using the signing secret.
 */
export async function verifySlackSignature(request: Request): Promise<boolean> {
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

  // Clone the request to read the body
  const body = await request.text();

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

/**
 * Parse the body from a Slack request after verification.
 * Since we already read the body in verification, we need to parse it again.
 */
export function parseSlackBody(bodyText: string): URLSearchParams {
  return new URLSearchParams(bodyText);
}

/**
 * Format leaderboard data as Slack Block Kit blocks.
 */
export function formatLeaderboard(
  entries: LeaderboardEntry[],
  period: "daily" | "weekly" | "monthly" | "alltime"
): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🏆 Claude Code Leaderboard - ${formatPeriod(period)}`,
        emoji: true,
      },
    },
    {
      type: "divider",
    },
  ];

  if (entries.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "_No usage data yet for this period. Start using Claude Code and sync your stats!_",
      },
    });
    return blocks;
  }

  // Add leaderboard entries
  for (const entry of entries.slice(0, 10)) {
    const rankDisplay = getRankEmoji(entry.rank);
    const userMention = entry.slackUserId
      ? `<@${entry.slackUserId}>`
      : entry.username;

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${rankDisplay} *${userMention}*`,
      },
      fields: [
        {
          type: "mrkdwn",
          text: `*Cost:* ${formatCost(entry.totalCost)}`,
        },
        {
          type: "mrkdwn",
          text: `*Tokens:* ${formatTokens(entry.totalTokens)}`,
        },
      ],
    });
  }

  blocks.push({
    type: "divider",
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `_Updated ${new Date().toLocaleString()}_`,
      },
    ],
  });

  return blocks;
}

/**
 * Format user stats as Slack Block Kit blocks.
 */
export function formatUserStats(
  stats: {
    rank: number;
    totalParticipants: number;
    totalTokens: number;
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  } | null,
  period: "daily" | "weekly" | "monthly"
): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📊 Your Claude Code Stats - ${formatPeriod(period)}`,
        emoji: true,
      },
    },
    {
      type: "divider",
    },
  ];

  if (!stats) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "_No usage data found for this period. Make sure you've set up the CLI and synced your stats!_",
      },
    });
    return blocks;
  }

  // Rank section
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${getRankEmoji(stats.rank)} *Rank: #${stats.rank}* of ${stats.totalParticipants} users`,
    },
  });

  // Main stats
  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Total Cost:*\n${formatCost(stats.totalCost)}`,
      },
      {
        type: "mrkdwn",
        text: `*Total Tokens:*\n${formatTokens(stats.totalTokens)}`,
      },
    ],
  });

  // Token breakdown
  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Input Tokens:*\n${formatTokens(stats.inputTokens)}`,
      },
      {
        type: "mrkdwn",
        text: `*Output Tokens:*\n${formatTokens(stats.outputTokens)}`,
      },
    ],
  });

  // Cache stats
  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Cache Creation:*\n${formatTokens(stats.cacheCreationTokens)}`,
      },
      {
        type: "mrkdwn",
        text: `*Cache Read:*\n${formatTokens(stats.cacheReadTokens)}`,
      },
    ],
  });

  blocks.push({
    type: "divider",
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `_Updated ${new Date().toLocaleString()}_`,
      },
    ],
  });

  return blocks;
}

/**
 * Format setup instructions as Slack Block Kit blocks.
 */
export function formatSetupInstructions(apiKey: string): SlackBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🚀 Claude Code Leaderboard Setup",
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
        text: "Your API key has been generated! Follow these steps to start syncing your Claude Code usage:",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Run this command in your terminal:*",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`\`\`npx github:Kisum/ccrank setup ${apiKey}\`\`\``,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "That's it! This will save your API key and install a Claude Code hook to auto-sync after each session.",
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "⚠️ _Keep your API key secret! Don't share it publicly._",
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Once set up, use `/ccrank leaderboard` to see the leaderboard and `/ccrank mystats` to see your personal stats!",
      },
    },
  ];
}

/**
 * Send a DM to a Slack user.
 */
export async function sendDM(
  userId: string,
  teamId: string,
  blocks: SlackBlock[],
  botToken: string
): Promise<boolean> {
  try {
    // Open a conversation with the user
    const openResponse = await fetch(
      "https://slack.com/api/conversations.open",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({
          users: userId,
        }),
      }
    );

    const openData = await openResponse.json();
    if (!openData.ok) {
      console.error("Failed to open conversation:", openData.error);
      return false;
    }

    const channelId = openData.channel.id;

    // Send the message
    const messageResponse = await fetch(
      "https://slack.com/api/chat.postMessage",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({
          channel: channelId,
          blocks: blocks,
          text: "Claude Code Leaderboard Setup", // Fallback text
        }),
      }
    );

    const messageData = await messageResponse.json();
    if (!messageData.ok) {
      console.error("Failed to send message:", messageData.error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending DM:", error);
    return false;
  }
}

/**
 * Generate a Slack OAuth URL for app installation.
 */
export function getSlackOAuthUrl(): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/slack/oauth`;
  const scopes = [
    "chat:write",
    "commands",
    "im:write",
    "users:read",
  ].join(",");

  return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

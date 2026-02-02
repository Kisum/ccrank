"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Period } from "./LeaderboardTabs";

interface LeaderboardProps {
  period: Period;
}

// Format large numbers (e.g., 2400000 -> "2.4M")
function formatTokens(tokens: number): string {
  // Handle invalid numbers
  if (!Number.isFinite(tokens) || tokens > 999_999_999_999) {
    return "-";
  }
  if (tokens < 0) {
    return "0";
  }
  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toLocaleString();
}

// Format cost (e.g., 156.8 -> "$156.80")
function formatCost(cost: number): string {
  // Handle edge cases for very large or very small numbers
  if (!Number.isFinite(cost) || cost > 99999999) {
    return "$-.--";
  }
  if (cost < 0) {
    return "$0.00";
  }
  return `$${cost.toFixed(2)}`;
}

// Sanitize username to prevent XSS and ensure safe display
function sanitizeUsername(username: string): string {
  // Only allow alphanumeric, hyphens, and underscores
  const sanitized = username.replace(/[^a-zA-Z0-9_-]/g, "");
  // Limit length
  return sanitized.slice(0, 39) || "unknown";
}

// Check if username is valid for linking to GitHub
function isValidGitHubUsername(username: string): boolean {
  // GitHub usernames: alphanumeric and hyphens, 1-39 chars, no consecutive hyphens
  const pattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
  return pattern.test(username) && !username.includes("--");
}

// Get rank display with medals for top 3
function getRankDisplay(rank: number): React.ReactNode {
  switch (rank) {
    case 1:
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rank-gold text-sm font-bold">
          1
        </span>
      );
    case 2:
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rank-silver text-sm font-bold">
          2
        </span>
      );
    case 3:
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rank-bronze text-sm font-bold">
          3
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 text-gray-500 text-sm font-medium">
          {rank}
        </span>
      );
  }
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-4 bg-[#f5f5f5] border border-[#e0e0e0] loading-pulse"
        >
          <div className="w-8 h-8 bg-[#e0e0e0]" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-[#e0e0e0]" />
          </div>
          <div className="h-4 w-16 bg-[#e0e0e0]" />
          <div className="h-4 w-20 bg-[#e0e0e0]" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 mb-4 bg-[#f5f5f5] border border-[#e0e0e0] flex items-center justify-center">
        <svg
          className="w-8 h-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-black mb-2">No data yet</h3>
      <p className="text-gray-500 text-center max-w-sm">
        Usage data will appear here once developers start tracking their Claude
        Code usage.
      </p>
    </div>
  );
}

// Helper component that queries each period's leaderboard
function LeaderboardDaily({ limit }: { limit?: number }) {
  const leaderboard = useQuery(api.leaderboard.getDailyLeaderboard, { limit });
  return <LeaderboardContent leaderboard={leaderboard} />;
}

function LeaderboardWeekly({ limit }: { limit?: number }) {
  const leaderboard = useQuery(api.leaderboard.getWeeklyLeaderboard, { limit });
  return <LeaderboardContent leaderboard={leaderboard} />;
}

function LeaderboardMonthly({ limit }: { limit?: number }) {
  const leaderboard = useQuery(api.leaderboard.getMonthlyLeaderboard, {
    limit,
  });
  return <LeaderboardContent leaderboard={leaderboard} />;
}

function LeaderboardAllTime({ limit }: { limit?: number }) {
  const leaderboard = useQuery(api.leaderboard.getAllTimeLeaderboard, {
    limit,
  });
  return <LeaderboardContent leaderboard={leaderboard} />;
}

// Shared content renderer
function LeaderboardContent({
  leaderboard,
}: {
  leaderboard:
    | {
        rank: number;
        displayName: string | undefined;
        slackUserId: string;
        totalTokens: number;
        totalCost: number;
      }[]
    | undefined;
}) {
  if (leaderboard === undefined) {
    return <LoadingSkeleton />;
  }

  if (leaderboard.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center gap-4 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
        <div className="w-8 text-center">Rank</div>
        <div className="flex-1">User</div>
        <div className="w-24 text-right">Tokens</div>
        <div className="w-24 text-right">Cost</div>
      </div>

      {/* Leaderboard entries */}
      <div className="space-y-2">
        {leaderboard.map((entry) => {
          const rawUsername =
            entry.displayName || `User ${entry.slackUserId.slice(-4)}`;
          const username = sanitizeUsername(rawUsername);
          const canLink = isValidGitHubUsername(username);
          return (
            <div
              key={`${entry.rank}-${entry.slackUserId}`}
              className={`
                flex items-center gap-4 p-4 border transition-all duration-200
                ${
                  entry.rank <= 3
                    ? "bg-[#f5f5f5] border-[#e0e0e0] card-hover"
                    : "bg-white border-[#e0e0e0] hover:bg-[#f5f5f5]"
                }
              `}
            >
              {/* Rank */}
              <div className="flex-shrink-0">{getRankDisplay(entry.rank)}</div>

              {/* Username */}
              <div className="flex-1 min-w-0">
                {canLink ? (
                  <a
                    href={`https://github.com/${encodeURIComponent(username)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium truncate block hover:underline text-black"
                  >
                    @{username}
                  </a>
                ) : (
                  <span className="font-medium truncate block text-black">
                    @{username}
                  </span>
                )}
              </div>

              {/* Tokens */}
              <div className="w-24 text-right">
                <span className="font-mono text-sm text-gray-600">
                  {formatTokens(entry.totalTokens)}
                </span>
              </div>

              {/* Cost */}
              <div className="w-24 text-right">
                <span className="font-mono text-sm font-semibold text-black">
                  {formatCost(entry.totalCost)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Leaderboard({ period }: LeaderboardProps) {
  const limit = 100;

  switch (period) {
    case "daily":
      return <LeaderboardDaily limit={limit} />;
    case "weekly":
      return <LeaderboardWeekly limit={limit} />;
    case "monthly":
      return <LeaderboardMonthly limit={limit} />;
    case "alltime":
      return <LeaderboardAllTime limit={limit} />;
    default:
      return <LeaderboardWeekly limit={limit} />;
  }
}

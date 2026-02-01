/**
 * Format a number of tokens for display.
 * Examples: 1500 -> "1.5K", 2400000 -> "2.4M"
 */
export function formatTokens(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B tokens`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M tokens`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K tokens`;
  }
  return `${num} tokens`;
}

/**
 * Format a cost in dollars.
 * Examples: 156.8 -> "$156.80", 0.05 -> "$0.05"
 */
export function formatCost(num: number): string {
  return `$${num.toFixed(2)}`;
}

/**
 * Get the emoji for a rank.
 * 1 -> 🥇, 2 -> 🥈, 3 -> 🥉, 4+ -> number
 */
export function getRankEmoji(rank: number): string {
  switch (rank) {
    case 1:
      return "🥇";
    case 2:
      return "🥈";
    case 3:
      return "🥉";
    default:
      return `${rank}.`;
  }
}

/**
 * Format a period for display.
 */
export function formatPeriod(
  period: "daily" | "weekly" | "monthly" | "alltime"
): string {
  switch (period) {
    case "daily":
      return "24 hours";
    case "weekly":
      return "7 days";
    case "monthly":
      return "30 days";
    case "alltime":
      return "All Time";
  }
}

/**
 * Get date range for a period.
 */
export function getDateRange(period: "daily" | "weekly" | "monthly" | "alltime"): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const endDate = now.toISOString().split("T")[0];

  let startDate: string;
  switch (period) {
    case "daily":
      startDate = endDate;
      break;
    case "weekly":
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = weekAgo.toISOString().split("T")[0];
      break;
    case "monthly":
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      startDate = monthAgo.toISOString().split("T")[0];
      break;
    case "alltime":
      startDate = "2020-01-01";
      break;
  }

  return { startDate, endDate };
}

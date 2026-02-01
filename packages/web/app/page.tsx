"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import Leaderboard from "@/components/Leaderboard";
import LeaderboardTabs, { type Period } from "@/components/LeaderboardTabs";

// Format large numbers (e.g., 2400000 -> "2.4M")
function formatTokens(tokens: number): string {
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
  return `$${cost.toFixed(2)}`;
}

function StatCard({
  label,
  value,
  subValue,
}: {
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="bg-[#111118] border border-[#1f1f2e] rounded-xl p-5 card-hover">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subValue && <p className="text-sm text-gray-400 mt-1">{subValue}</p>}
    </div>
  );
}

export default function Home() {
  const [period, setPeriod] = useState<Period>("weekly");
  const stats = useQuery(api.leaderboard.getStatsSummary, { period });

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur-md border-b border-[#1f1f2e]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://media.licdn.com/dms/image/v2/D4E0BAQHepn-93K0ntg/company-logo_200_200/B4EZiEuaY_GcAI-/0/1754573416289/rye_logo?e=2147483647&v=beta&t=-SpDi-JH-E3R2SCJ-jaP-1qv15Ciyhq0ItgKJRE4GDY"
              alt="Rye logo"
              className="w-10 h-10 rounded-xl"
            />
            <h1 className="text-xl font-bold gradient-text">Rye Claude Code Usage Leaderboard</h1>
          </div>

          <a
            href="/setup"
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-[#1a1a24] hover:bg-[#242432] border border-[#2a2a3e] rounded-lg transition-colors"
          >
            Sync your usage
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            <span className="gradient-text">Who&apos;s coding with Claude?</span>
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Track usage across developers and teams. See who&apos;s leveraging AI
            assistance the most.
          </p>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Total Tokens"
            value={stats ? formatTokens(stats.totalTokens) : "--"}
            subValue="across all users"
          />
          <StatCard
            label="Total Spent"
            value={stats ? formatCost(stats.totalCost) : "--"}
            subValue="in API costs"
          />
          <StatCard
            label="Active Users"
            value={stats ? stats.totalUsers.toString() : "--"}
            subValue="tracking usage"
          />
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-6">
          <LeaderboardTabs activePeriod={period} onPeriodChange={setPeriod} />
        </div>

        {/* Leaderboard */}
        <div className="bg-[#0d0d14] border border-[#1f1f2e] rounded-2xl p-4 md:p-6">
          <Leaderboard period={period} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1f1f2e] py-6">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-center gap-2">
          <p className="text-sm text-gray-500">Powered by</p>
          <img
            src="https://media.licdn.com/dms/image/v2/D4E0BAQHepn-93K0ntg/company-logo_200_200/B4EZiEuaY_GcAI-/0/1754573416289/rye_logo?e=2147483647&v=beta&t=-SpDi-JH-E3R2SCJ-jaP-1qv15Ciyhq0ItgKJRE4GDY"
            alt="Rye logo"
            className="w-5 h-5 rounded"
          />
          <span className="text-sm font-semibold gradient-text">Rye</span>
        </div>
      </footer>
    </div>
  );
}

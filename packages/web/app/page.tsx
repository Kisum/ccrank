"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import Leaderboard from "@/components/Leaderboard";
import LeaderboardTabs, { type Period } from "@/components/LeaderboardTabs";
import MemberUsageChart from "@/components/MemberUsageChart";

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

const CLAUDE_MAX_MONTHLY_COST = 200;

function getPeriodDays(period: Period): number {
  switch (period) {
    case "daily": return 1;
    case "weekly": return 7;
    case "monthly": return 30;
    case "alltime": return 30;
  }
}

function calcAmountSaved(totalCost: number, totalUsers: number, period: Period): number {
  const days = getPeriodDays(period);
  const maxPlanCost = totalUsers * CLAUDE_MAX_MONTHLY_COST * (days / 30);
  return totalCost - maxPlanCost;
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
    <div className="bg-[#f5f5f5] border border-[#e0e0e0] p-5 card-hover">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-black">{value}</p>
      {subValue && <p className="text-sm text-gray-600 mt-1">{subValue}</p>}
    </div>
  );
}

export default function Home() {
  const [period, setPeriod] = useState<Period>("weekly");

  useEffect(() => {
    const saved = localStorage.getItem("ccusage_period");
    if (saved && ["daily", "weekly", "monthly", "alltime"].includes(saved)) {
      setPeriod(saved as Period);
    }
  }, []);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    localStorage.setItem("ccusage_period", p);
  };

  const pageData = useQuery(api.leaderboard.getPageData, { period, limit: 100 });

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-[#e0e0e0]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image
              src="https://media.licdn.com/dms/image/v2/D4E0BAQHepn-93K0ntg/company-logo_200_200/B4EZiEuaY_GcAI-/0/1754573416289/rye_logo?e=2147483647&v=beta&t=-SpDi-JH-E3R2SCJ-jaP-1qv15Ciyhq0ItgKJRE4GDY"
              alt="Rye logo"
              width={40}
              height={40}
              className="w-10 h-10"
            />
            <h1 className="text-xl font-bold text-black">Claude Code Usage Leaderboard</h1>
          </a>

          <a
            href="/setup"
            className="px-4 py-2 text-sm font-medium text-black bg-[#CCFF6F] hover:bg-[#b8e65f] border border-[#CCFF6F] transition-colors"
          >
            Sync your usage
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-3 text-black">
            Who&apos;s coding with Claude?
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto">
            Track usage across developers and teams. See who&apos;s leveraging AI
            assistance the most.
          </p>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Total Tokens"
            value={pageData ? formatTokens(pageData.statsSummary.totalTokens) : "--"}
            subValue="across all users"
          />
          <StatCard
            label="Total Spent"
            value={pageData ? formatCost(pageData.statsSummary.totalCost) : "--"}
            subValue="in API costs"
          />
          <StatCard
            label="Amount Saved"
            value={pageData ? formatCost(calcAmountSaved(pageData.statsSummary.totalCost, pageData.statsSummary.totalUsers, period)) : "--"}
            subValue={`vs $200/mo Max plans (${pageData?.statsSummary.totalUsers ?? 0} users)`}
          />
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-6">
          <LeaderboardTabs activePeriod={period} onPeriodChange={handlePeriodChange} />
        </div>

        {/* Member Usage Over Time */}
        <div className="bg-white border border-[#e0e0e0] p-4 md:p-6 mb-6">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Usage Over Time
          </h3>
          <MemberUsageChart period={period} />
        </div>

        {/* Leaderboard */}
        <div className="bg-white border border-[#e0e0e0] p-4 md:p-6">
          <Leaderboard period={period} data={pageData ? pageData.leaderboard : null} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e0e0e0] py-6">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-center gap-2">
          <Image
            src="https://media.licdn.com/dms/image/v2/D4E0BAQHepn-93K0ntg/company-logo_200_200/B4EZiEuaY_GcAI-/0/1754573416289/rye_logo?e=2147483647&v=beta&t=-SpDi-JH-E3R2SCJ-jaP-1qv15Ciyhq0ItgKJRE4GDY"
            alt="Rye logo"
            width={20}
            height={20}
            className="w-5 h-5"
          />
          <span className="text-sm font-semibold text-black">Rye</span>
        </div>
      </footer>
    </div>
  );
}

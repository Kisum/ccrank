"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Period } from "./LeaderboardTabs";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface UsageChartProps {
  period: Period;
}

// Format date for display (e.g., "Jan 15")
function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Format cost for tooltip
function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function LoadingSkeleton() {
  return (
    <div className="h-64 bg-[#f5f5f5] border border-[#e0e0e0] loading-pulse flex items-center justify-center">
      <span className="text-gray-400">Loading chart...</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-64 bg-[#f5f5f5] border border-[#e0e0e0] flex items-center justify-center">
      <span className="text-gray-500">No usage data to display</span>
    </div>
  );
}

interface TooltipPayloadItem {
  value: number;
  dataKey: string;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const cost = payload.find((p) => p.dataKey === "totalCost")?.value ?? 0;

  return (
    <div className="bg-white border border-[#e0e0e0] p-3 shadow-lg">
      <p className="font-medium text-black mb-2">{label}</p>
      <p className="text-sm text-gray-600">
        Cost:{" "}
        <span className="font-mono font-semibold text-black">
          {formatCost(cost)}
        </span>
      </p>
    </div>
  );
}

export default function UsageChart({ period }: UsageChartProps) {
  const chartData = useQuery(api.leaderboard.getDailyUsageChart, { period });

  if (chartData === undefined) {
    return <LoadingSkeleton />;
  }

  if (chartData.length === 0) {
    return <EmptyState />;
  }

  // Transform data for display
  const displayData = chartData.map((item) => ({
    ...item,
    dateLabel: formatDateLabel(item.date),
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={displayData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#CCFF6F" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#CCFF6F" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 12, fill: "#666" }}
            tickLine={{ stroke: "#e0e0e0" }}
            axisLine={{ stroke: "#e0e0e0" }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#666" }}
            tickLine={{ stroke: "#e0e0e0" }}
            axisLine={{ stroke: "#e0e0e0" }}
            tickFormatter={(value: number) => `$${value}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="totalCost"
            stroke="#9ACC45"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorCost)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

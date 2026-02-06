"use client";

import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Period } from "./LeaderboardTabs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Paul Tol's colorblind-safe palettes (vibrant + bright)
const CHART_COLORS = [
  "#0077BB", // blue (vibrant)
  "#EE7733", // orange (vibrant)
  "#009988", // teal (vibrant)
  "#EE3377", // magenta (vibrant)
  "#CC3311", // red (vibrant)
  "#33BBEE", // cyan (vibrant)
  "#AA3377", // purple (bright)
  "#228833", // green (bright)
  "#CCBB44", // yellow (bright)
  "#4477AA", // steel blue (bright)
];

interface MemberUsageChartProps {
  period: Period;
}

type ChartBucket = "day" | "week" | "month";

type ChartTimeRange = "30d" | "90d" | "6m" | "1y" | "all";

function formatDateLabel(dateStr: string, bucket: ChartBucket): string {
  const date = new Date(dateStr + "T00:00:00");
  if (bucket === "month") {
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const year = date.getFullYear().toString().slice(-2);
    return `${month} '${year}`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function LoadingSkeleton() {
  return (
    <div className="h-80 bg-gradient-to-b from-[#fafafa] to-white border border-[#e8e8e8] loading-pulse flex items-center justify-center">
      <span className="text-gray-300 text-sm tracking-wide">Loading chart...</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-80 bg-gradient-to-b from-[#fafafa] to-white border border-[#e8e8e8] flex items-center justify-center">
      <span className="text-gray-400 text-sm">No usage data to display</span>
    </div>
  );
}

interface TooltipPayloadItem {
  value: number;
  dataKey: string;
  color: string;
  name: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  // Sort by value descending
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const total = sorted.reduce((sum, entry) => sum + (entry.value ?? 0), 0);

  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.82)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(0, 0, 0, 0.06)",
        borderRadius: 10,
        padding: "12px 16px",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)",
        maxWidth: 260,
        fontSize: 13,
      }}
    >
      <p className="font-semibold text-black mb-2" style={{ fontSize: 13 }}>{label}</p>
      <div className="space-y-0.5">
        {sorted.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2" style={{ fontSize: 12 }}>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-500 truncate">@{entry.name}</span>
            <span className="font-mono font-semibold text-black ml-auto tabular-nums">
              {formatCost(entry.value ?? 0)}
            </span>
          </div>
        ))}
      </div>
      {sorted.length > 1 && (
        <div
          className="flex items-center justify-between mt-2 pt-2"
          style={{ borderTop: "1px solid rgba(0,0,0,0.06)", fontSize: 12 }}
        >
          <span className="text-gray-400 font-medium">Total</span>
          <span className="font-mono font-bold text-black tabular-nums">
            {formatCost(total)}
          </span>
        </div>
      )}
    </div>
  );
}

interface LegendPayloadItem {
  value: string;
  color: string;
  dataKey: string;
}

interface CustomLegendProps {
  payload?: LegendPayloadItem[];
  hiddenUsers: Set<string>;
  onToggle: (username: string) => void;
}

function CustomLegend({ payload, hiddenUsers, onToggle }: CustomLegendProps) {
  if (!payload) return null;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-3 px-2">
      {payload.map((entry) => {
        const hidden = hiddenUsers.has(entry.value);
        return (
          <button
            key={entry.value}
            onClick={() => onToggle(entry.value)}
            className="flex items-center gap-1.5 text-xs transition-all duration-150 cursor-pointer"
            style={{ opacity: hidden ? 0.35 : 1 }}
          >
            <span
              className="flex-shrink-0 transition-colors duration-150"
              style={{
                width: 10,
                height: 3,
                borderRadius: 1.5,
                backgroundColor: hidden ? "#d4d4d4" : entry.color,
              }}
            />
            <span
              className="transition-colors duration-150"
              style={{
                color: hidden ? "#a3a3a3" : "#525252",
                textDecoration: hidden ? "line-through" : "none",
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              @{entry.value}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const BUCKET_OPTIONS: { value: ChartBucket; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

const TIME_RANGE_OPTIONS: { value: ChartTimeRange; label: string }[] = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "6m", label: "6m" },
  { value: "1y", label: "1y" },
  { value: "all", label: "All" },
];

export default function MemberUsageChart({ period }: MemberUsageChartProps) {
  const [bucket, setBucket] = useState<ChartBucket>("day");
  const [cumulative, setCumulative] = useState(true);
  const [timeRange, setTimeRange] = useState<ChartTimeRange>("90d");
  const data = useQuery(api.leaderboard.getUserDailyUsageChart, { period, bucketBy: bucket, timeRange });
  const [hiddenUsers, setHiddenUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const savedBucket = localStorage.getItem("chart-bucket");
    if (savedBucket === "day" || savedBucket === "week" || savedBucket === "month") {
      setBucket(savedBucket);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("chart-cumulative");
    if (saved !== null) {
      setCumulative(saved === "true");
    }
  }, []);

  useEffect(() => {
    const savedRange = localStorage.getItem("chart-timerange");
    if (savedRange && ["30d", "90d", "6m", "1y", "all"].includes(savedRange)) {
      setTimeRange(savedRange as ChartTimeRange);
    }
  }, []);

  const handleBucketChange = (value: ChartBucket) => {
    setBucket(value);
    localStorage.setItem("chart-bucket", value);
  };

  const handleCumulativeChange = (value: boolean) => {
    setCumulative(value);
    localStorage.setItem("chart-cumulative", String(value));
  };

  const handleTimeRangeChange = (value: ChartTimeRange) => {
    setTimeRange(value);
    localStorage.setItem("chart-timerange", value);
  };

  if (data === undefined) {
    return <LoadingSkeleton />;
  }

  if (!data.users.length || !data.chartData.length) {
    return <EmptyState />;
  }

  const { users, chartData } = data;

  const displayData = chartData.map((item) => ({
    ...item,
    dateLabel: formatDateLabel(item.date as string, bucket),
  }));

  const finalData = cumulative
    ? (() => {
        const running: Record<string, number> = {};
        return displayData.map((item) => {
          const newItem = { ...item };
          for (const user of users) {
            const key = user.displayName;
            const val = ((item as Record<string, unknown>)[key] as number) ?? 0;
            running[key] = (running[key] ?? 0) + val;
            (newItem as Record<string, unknown>)[key] = Math.round(running[key] * 100) / 100;
          }
          return newItem;
        });
      })()
    : displayData;

  const toggleUser = (username: string) => {
    setHiddenUsers((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="inline-flex p-0.5 gap-0.5 bg-[#f5f5f5] border border-[#e8e8e8] rounded-md">
            {BUCKET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleBucketChange(opt.value)}
                className={`px-3 py-1 text-xs font-medium transition-all duration-150 cursor-pointer rounded-[5px] ${
                  bucket === opt.value
                    ? "bg-black text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="inline-flex p-0.5 gap-0.5 bg-[#f5f5f5] border border-[#e8e8e8] rounded-md">
            {TIME_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleTimeRangeChange(opt.value)}
                className={`px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer rounded-[5px] ${
                  timeRange === opt.value
                    ? "bg-black text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="inline-flex p-0.5 gap-0.5 bg-[#f5f5f5] border border-[#e8e8e8] rounded-md">
          <button
            onClick={() => handleCumulativeChange(true)}
            className={`px-3 py-1 text-xs font-medium transition-all duration-150 cursor-pointer rounded-[5px] ${
              cumulative
                ? "bg-black text-white shadow-sm"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            Cumulative
          </button>
          <button
            onClick={() => handleCumulativeChange(false)}
            className={`px-3 py-1 text-xs font-medium transition-all duration-150 cursor-pointer rounded-[5px] ${
              !cumulative
                ? "bg-black text-white shadow-sm"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            Per Period
          </button>
        </div>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={finalData}
            margin={{ top: 5, right: 12, left: -8, bottom: 0 }}
          >
            <CartesianGrid
              stroke="#f0f0f0"
              strokeWidth={1}
              vertical={false}
            />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 11, fill: "#a3a3a3" }}
              tickLine={false}
              axisLine={{ stroke: "#e5e5e5" }}
              dy={6}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#a3a3a3" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `$${value}`}
              dx={-4}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "#d4d4d4",
                strokeWidth: 1,
                strokeDasharray: "4 3",
              }}
              wrapperStyle={{ outline: "none" }}
            />
            <Legend
              content={
                <CustomLegend
                  hiddenUsers={hiddenUsers}
                  onToggle={toggleUser}
                />
              }
            />
            {users.map((user, index) => (
              <Line
                key={user.displayName}
                type="monotone"
                dataKey={user.displayName}
                name={user.displayName}
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{
                  r: 5,
                  fill: "#fff",
                  stroke: CHART_COLORS[index % CHART_COLORS.length],
                  strokeWidth: 2.5,
                }}
                hide={hiddenUsers.has(user.displayName)}
                connectNulls={false}
                animationDuration={800}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

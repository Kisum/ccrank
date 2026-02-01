"use client";

export type Period = "daily" | "weekly" | "monthly" | "alltime";

interface LeaderboardTabsProps {
  activePeriod: Period;
  onPeriodChange: (period: Period) => void;
}

const tabs: { id: Period; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "alltime", label: "All-Time" },
];

export default function LeaderboardTabs({
  activePeriod,
  onPeriodChange,
}: LeaderboardTabsProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-[#111118] rounded-xl border border-[#1f1f2e]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onPeriodChange(tab.id)}
          className={`
            relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200
            ${
              activePeriod === tab.id
                ? "bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-white tab-active"
                : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f2e]"
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

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
    <div className="flex items-center gap-1 p-1 bg-[#f5f5f5] border border-[#e0e0e0]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onPeriodChange(tab.id)}
          className={`
            relative px-4 py-2 text-sm font-medium transition-all duration-200
            ${
              activePeriod === tab.id
                ? "bg-[#CCFF6F] text-black tab-active"
                : "text-gray-600 hover:text-black hover:bg-[#e0e0e0]"
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

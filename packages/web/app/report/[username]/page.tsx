"use client";

import { use } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function ReportPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const report = useQuery(api.insightsReports.getInsightsReportByUsername, {
    username,
  });

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-[#e0e0e0]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Image
              src="https://media.licdn.com/dms/image/v2/D4E0BAQHepn-93K0ntg/company-logo_200_200/B4EZiEuaY_GcAI-/0/1754573416289/rye_logo?e=2147483647&v=beta&t=-SpDi-JH-E3R2SCJ-jaP-1qv15Ciyhq0ItgKJRE4GDY"
              alt="Rye logo"
              width={40}
              height={40}
              className="w-10 h-10"
            />
            <h1 className="text-xl font-bold text-black">
              Claude Code Usage Leaderboard
            </h1>
          </Link>

          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium text-black bg-[#CCFF6F] hover:bg-[#b8e65f] border border-[#CCFF6F] transition-colors"
          >
            Back to Leaderboard
          </Link>
        </div>
      </header>

      {/* Content */}
      {report === undefined ? (
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Loading report...</p>
        </main>
      ) : report === null ? (
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mb-4 mx-auto bg-[#f5f5f5] border border-[#e0e0e0] flex items-center justify-center">
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-black mb-2">
              No report found
            </h2>
            <p className="text-gray-500 text-sm">
              @{username} hasn&apos;t uploaded their insights report yet.
            </p>
          </div>
        </main>
      ) : (
        <>
          <div className="bg-[#f5f5f5] border-b border-[#e0e0e0] px-4 py-3">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-medium text-black">
                  @{report.displayName || username}
                </span>
                &apos;s Insights Report
              </p>
              <p className="text-xs text-gray-400">
                Uploaded{" "}
                {new Date(report.uploadedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          <main className="flex-1">
            <iframe
              srcDoc={report.reportHtml}
              sandbox=""
              className="w-full h-full border-0"
              style={{ minHeight: "calc(100vh - 140px)" }}
              title={`${username}'s Claude Code Insights Report`}
            />
          </main>
        </>
      )}
    </div>
  );
}

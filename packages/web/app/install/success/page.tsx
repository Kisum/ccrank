"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const teamName = searchParams.get("team") || "your workspace";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Installation Successful!
          </h1>
          <p className="text-gray-600 mb-6">
            Claude Code Leaderboard has been installed to{" "}
            <span className="font-semibold">{teamName}</span>.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
            <h2 className="font-semibold text-gray-900 mb-2">Next Steps:</h2>
            <ol className="text-sm text-gray-600 space-y-2">
              <li>
                1. Open Slack and type{" "}
                <code className="bg-gray-200 px-1 rounded">/ccrank setup</code>{" "}
                to get your API key
              </li>
              <li>
                2. Install the ccusage CLI:{" "}
                <code className="bg-gray-200 px-1 rounded">
                  npm install -g ccusage
                </code>
              </li>
              <li>3. Configure and sync your stats</li>
              <li>
                4. Use{" "}
                <code className="bg-gray-200 px-1 rounded">
                  /ccrank leaderboard
                </code>{" "}
                to see the competition!
              </li>
            </ol>
          </div>
          <a
            href="slack://open"
            className="inline-flex items-center justify-center px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            Open Slack
          </a>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}

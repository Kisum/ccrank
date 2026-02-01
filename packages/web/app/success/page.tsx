import Link from "next/link";

export default function SuccessPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Success Icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white mb-3">
          Successfully Installed!
        </h1>

        {/* Description */}
        <p className="text-gray-400 mb-8">
          The ccrank Slack app has been installed to your workspace. You can now
          start tracking your Claude Code usage.
        </p>

        {/* Next Steps Card */}
        <div className="bg-[#111118] border border-[#1f1f2e] rounded-xl p-6 mb-8 text-left">
          <h2 className="font-semibold text-white mb-4">Next Steps</h2>
          <ol className="space-y-3 text-sm text-gray-400">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                1
              </span>
              <span>
                Open Slack and message the ccrank bot with{" "}
                <code className="bg-[#1f1f2e] px-2 py-0.5 rounded text-indigo-300">
                  /ccrank setup
                </code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                2
              </span>
              <span>Follow the instructions to get your API key</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                3
              </span>
              <span>
                Configure your CLI with{" "}
                <code className="bg-[#1f1f2e] px-2 py-0.5 rounded text-indigo-300">
                  ccusage --share
                </code>
              </span>
            </li>
          </ol>
        </div>

        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium rounded-xl transition-all duration-200 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Leaderboard
        </Link>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-6 text-sm text-gray-500">
        <span className="font-semibold gradient-text">ccrank</span>
      </footer>
    </div>
  );
}

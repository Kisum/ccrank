"use client";

import { useState } from "react";
import Image from "next/image";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";

export default function SetupPage() {
  const { data: session, status } = useSession();

  const user = session?.user as { username?: string; name?: string | null; image?: string | null } | undefined;
  const username = user?.username || user?.name || "";

  const getSetupCommand = () => {
    return `npx github:Kisum/ccrank setup "${username}"`;
  };

  const getSyncCommand = () => {
    return `npx github:Kisum/ccrank sync`;
  };

  const [copiedSetup, setCopiedSetup] = useState(false);
  const [copiedSync, setCopiedSync] = useState(false);

  const copySetupCommand = () => {
    navigator.clipboard.writeText(getSetupCommand());
    setCopiedSetup(true);
    setTimeout(() => setCopiedSetup(false), 2000);
  };

  const copySyncCommand = () => {
    navigator.clipboard.writeText(getSyncCommand());
    setCopiedSync(true);
    setTimeout(() => setCopiedSync(false), 2000);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold gradient-text mb-2">rye Setup</h1>
          <p className="text-gray-400">Sync your Claude Code usage to the leaderboard</p>
        </div>

        {!session ? (
          <div className="bg-[#111118] border border-[#1f1f2e] rounded-xl p-6 text-center">
            <p className="text-gray-400 mb-6">Sign in with GitHub to get your sync command</p>
            <button
              onClick={() => signIn("github")}
              className="inline-flex items-center gap-3 px-6 py-3 bg-[#24292e] hover:bg-[#2f363d] text-white font-medium rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" />
              </svg>
              Sign in with GitHub
            </button>
          </div>
        ) : (
          <div className="bg-[#111118] border border-[#1f1f2e] rounded-xl p-6">
            <div className="mb-6 flex items-center gap-3">
              {session.user?.image && (
                <Image
                  src={session.user.image}
                  alt=""
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full"
                />
              )}
              <div>
                <p className="text-white font-medium">{username}</p>
                <p className="text-gray-500 text-sm">Signed in with GitHub</p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-gray-400 text-sm mb-3">
                <span className="text-white font-medium">Step 1:</span> Run this once to set up:
              </p>
              <div
                className="bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg p-4 font-mono text-sm cursor-pointer hover:bg-[#0f0f18] transition-colors"
                onClick={copySetupCommand}
              >
                <code className="text-indigo-400">{getSetupCommand()}</code>
              </div>
              <p className="text-gray-500 text-xs mt-2">
                {copiedSetup ? "✓ Copied!" : "Click to copy"}
              </p>
            </div>

            <div className="mb-6">
              <p className="text-gray-400 text-sm mb-3">
                <span className="text-white font-medium">Step 2:</span> Sync your usage:
              </p>
              <div
                className="bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg p-4 font-mono text-sm cursor-pointer hover:bg-[#0f0f18] transition-colors"
                onClick={copySyncCommand}
              >
                <code className="text-indigo-400">{getSyncCommand()}</code>
              </div>
              <p className="text-gray-500 text-xs mt-2">
                {copiedSync ? "✓ Copied!" : "Click to copy"}
              </p>
            </div>

            <div className="text-gray-400 text-sm">
              <p>After setup, your usage syncs automatically after each Claude Code session.</p>
              <p className="mt-1">You can also run <code className="text-indigo-400">npx github:Kisum/ccrank sync</code> anytime to sync manually.</p>
            </div>

            <div className="mt-6 pt-4 border-t border-[#2a2a3e]">
              <Link
                href="/"
                className="text-indigo-400 hover:text-indigo-300 text-sm"
              >
                ← Back to Leaderboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

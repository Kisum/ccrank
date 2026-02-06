"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";

interface KeyStatus {
  hasKey: boolean;
  keyPrefix?: string;
  username: string;
}

interface KeyGenResult {
  success: boolean;
  apiKey: string;
  keyPrefix: string;
  username: string;
}

export default function SetupPage() {
  const { data: session, status } = useSession();

  const user = session?.user as { username?: string; name?: string | null; image?: string | null } | undefined;
  const username = user?.username || user?.name || "";

  const [copied, setCopied] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportUploading, setReportUploading] = useState(false);
  const [reportUploaded, setReportUploaded] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Auto-generate API key when user signs in
  useEffect(() => {
    if (!session?.user || !username) return;

    // Check localStorage first
    const storedKey = localStorage.getItem(`ccusage_api_key_${username.toLowerCase()}`);
    if (storedKey) {
      setApiKey(storedKey);
      return;
    }

    // No stored key - auto-generate one
    const generateKey = async () => {
      setIsGenerating(true);
      setError(null);

      try {
        const res = await fetch("/api/keys/generate", {
          method: "POST",
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to generate API key");
        }

        const result = data as KeyGenResult;
        setApiKey(result.apiKey);

        // Store in localStorage
        localStorage.setItem(`ccusage_api_key_${username.toLowerCase()}`, result.apiKey);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate API key");
      } finally {
        setIsGenerating(false);
      }
    };

    generateKey();
  }, [session, username]);

  const regenerateApiKey = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/keys/generate", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate API key");
      }

      const result = data as KeyGenResult;
      setApiKey(result.apiKey);

      // Store in localStorage
      localStorage.setItem(`ccusage_api_key_${username.toLowerCase()}`, result.apiKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate API key");
    } finally {
      setIsGenerating(false);
    }
  }, [username]);

  const getCommand = () => {
    if (!apiKey) {
      return "# Generate an API key first";
    }
    return `npx ccusage@latest --json 2>/dev/null | curl -s -X POST "https://ccusageshare-leaderboard.vercel.app/api/sync?tz=$(date +%z)" -H "Content-Type: application/json" -H "Authorization: Bearer ${apiKey}" -d @-`;
  };

  const copyToClipboard = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(getCommand());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReportFile = async (file: File) => {
    setReportError(null);
    setReportUploading(true);

    try {
      const text = await file.text();
      if (!text.includes("Claude Code Insights")) {
        throw new Error("This doesn't look like a Claude Code /insights report");
      }
      if (text.length > 500_000) {
        throw new Error("Report file is too large (max 500KB)");
      }

      const res = await fetch("/api/report/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportHtml: text }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload report");
      }

      setReportUploaded(true);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Failed to upload report");
    } finally {
      setReportUploading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-[#e0e0e0]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image
              src="https://media.licdn.com/dms/image/v2/D4E0BAQHepn-93K0ntg/company-logo_200_200/B4EZiEuaY_GcAI-/0/1754573416289/rye_logo?e=2147483647&v=beta&t=-SpDi-JH-E3R2SCJ-jaP-1qv15Ciyhq0ItgKJRE4GDY"
              alt="Rye logo"
              width={40}
              height={40}
              className="w-10 h-10"
            />
            <h1 className="text-xl font-bold text-black">Claude Code Usage Leaderboard</h1>
          </Link>

          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium text-black bg-[#CCFF6F] hover:bg-[#b8e65f] border border-[#CCFF6F] transition-colors"
          >
            Back to Leaderboard
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-black mb-2">Sync Usage</h1>
            <p className="text-gray-600">Sync your Claude Code usage to the leaderboard</p>
          </div>

          {!session ? (
            <div className="bg-[#f5f5f5] border border-[#e0e0e0] p-6 text-center">
              <p className="text-gray-600 mb-6">Sign in with GitHub to get your sync command</p>
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
            <div className="bg-[#f5f5f5] border border-[#e0e0e0] p-6">
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
                  <p className="text-black font-medium">@{username}</p>
                  <p className="text-gray-500 text-sm">Signed in with GitHub</p>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              {isGenerating ? (
                <div className="mb-6 text-center py-4">
                  <p className="text-gray-600 text-sm">Generating your API key...</p>
                </div>
              ) : apiKey ? (
                <>
                  <div className="mb-6">
                    <p className="text-gray-600 text-sm mb-3">Run this command to sync:</p>
                    <div
                      className="bg-white border border-[#e0e0e0] p-4 font-mono text-xs break-all cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={copyToClipboard}
                    >
                      <code className="text-black">{getCommand()}</code>
                    </div>
                    <p className="text-gray-500 text-xs mt-2">
                      {copied ? "Copied!" : "Click to copy"}
                    </p>
                  </div>

                  <div className="text-gray-600 text-sm space-y-2">
                    <p>Run this anytime to update your stats on the leaderboard.</p>
                    <p className="text-xs text-gray-500">
                      To rotate your API key,{" "}
                      <button
                        onClick={regenerateApiKey}
                        className="text-blue-600 hover:underline"
                      >
                        click here
                      </button>
                      .
                    </p>
                  </div>
                </>
              ) : null}

              {/* Insights Report Upload */}
              <div className="mt-6 bg-white border border-[#e0e0e0] p-6">
                <h2 className="text-lg font-bold text-black mb-1">Upload Insights Report</h2>
                <p className="text-gray-600 text-sm mb-4">
                  Drag & drop your Claude Code <code className="bg-white px-1.5 py-0.5 border border-[#e0e0e0] text-xs">/insights</code> report to share it on the leaderboard
                </p>

                {reportUploaded ? (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 mx-auto mb-3 bg-[#CCFF6F] flex items-center justify-center">
                      <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-black font-medium mb-2">Report uploaded!</p>
                    <a
                      href={`/report/${encodeURIComponent(username.toLowerCase())}`}
                      className="text-sm font-medium text-black bg-[#CCFF6F] hover:bg-[#b8e65f] px-4 py-2 inline-block border border-[#CCFF6F] transition-colors"
                    >
                      View your report
                    </a>
                  </div>
                ) : (
                  <div
                    className={`border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
                      isDragging
                        ? "border-[#CCFF6F] bg-[#CCFF6F]/10"
                        : "border-[#e0e0e0] hover:border-gray-400"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleReportFile(file);
                    }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".html";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleReportFile(file);
                      };
                      input.click();
                    }}
                  >
                    {reportUploading ? (
                      <div>
                        <div className="w-8 h-8 mx-auto mb-3 border-2 border-gray-300 border-t-black animate-spin rounded-full" />
                        <p className="text-gray-600 text-sm">Uploading report...</p>
                      </div>
                    ) : (
                      <>
                        <svg className="w-10 h-10 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-gray-600 text-sm mb-1">
                          {isDragging ? "Drop your report here" : "Drag & drop your report.html here"}
                        </p>
                        <p className="text-gray-400 text-xs">or click to browse</p>
                      </>
                    )}
                  </div>
                )}

                {reportError && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
                    {reportError}
                  </div>
                )}
              </div>
            </div>
          )}
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

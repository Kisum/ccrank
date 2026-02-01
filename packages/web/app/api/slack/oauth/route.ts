import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: {
    id: string;
    name: string;
  };
  authed_user?: {
    id: string;
    scope?: string;
    access_token?: string;
    token_type?: string;
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  // Handle OAuth errors
  if (error) {
    console.error("Slack OAuth error:", error);
    return NextResponse.redirect(
      `${appUrl}/install/error?error=${encodeURIComponent(error)}`
    );
  }

  // Validate code
  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/install/error?error=${encodeURIComponent("Missing authorization code")}`
    );
  }

  // Validate environment variables
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing Slack OAuth credentials");
    return NextResponse.redirect(
      `${appUrl}/install/error?error=${encodeURIComponent("Server configuration error")}`
    );
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${appUrl}/api/slack/oauth`,
      }),
    });

    const tokenData: SlackOAuthResponse = await tokenResponse.json();

    if (!tokenData.ok) {
      console.error("Slack token exchange failed:", tokenData.error);
      return NextResponse.redirect(
        `${appUrl}/install/error?error=${encodeURIComponent(tokenData.error || "Token exchange failed")}`
      );
    }

    // Extract workspace info
    const teamId = tokenData.team?.id;
    const teamName = tokenData.team?.name;
    const botToken = tokenData.access_token;

    if (!teamId || !teamName || !botToken) {
      console.error("Missing workspace info in OAuth response");
      return NextResponse.redirect(
        `${appUrl}/install/error?error=${encodeURIComponent("Missing workspace information")}`
      );
    }

    // Store workspace in Convex
    const convex = getConvexClient();
    await convex.mutation(api.slack.saveWorkspace, {
      teamId,
      teamName,
      botToken,
    });

    // Redirect to success page
    return NextResponse.redirect(
      `${appUrl}/install/success?team=${encodeURIComponent(teamName)}`
    );
  } catch (error) {
    console.error("OAuth error:", error);
    return NextResponse.redirect(
      `${appUrl}/install/error?error=${encodeURIComponent("An unexpected error occurred")}`
    );
  }
}

import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId) {
    return NextResponse.json(
      { error: "SLACK_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL not configured" },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/slack/oauth`;

  // Scopes needed for the bot
  const scopes = [
    "chat:write",      // Send messages
    "commands",        // Handle slash commands
    "im:write",        // Send DMs
    "users:read",      // Read user info
  ].join(",");

  // Construct the Slack OAuth URL
  const slackOAuthUrl = new URL("https://slack.com/oauth/v2/authorize");
  slackOAuthUrl.searchParams.set("client_id", clientId);
  slackOAuthUrl.searchParams.set("scope", scopes);
  slackOAuthUrl.searchParams.set("redirect_uri", redirectUri);

  // Redirect to Slack OAuth
  return NextResponse.redirect(slackOAuthUrl.toString());
}

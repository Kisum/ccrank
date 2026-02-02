# Claude Code Usage Leaderboard - Development Notes

## Deployment

### Vercel
The web app deploys to Vercel. **Important**: Always deploy using the `ccusageshare-leaderboard` project which has the environment variables configured.

```bash
# Link to the correct project first
npx vercel link --yes --project ccusageshare-leaderboard

# Deploy to production
npx vercel --prod
```

**Do NOT** run `npx vercel --prod` without linking first - it may create a new project without env vars.

The production URL is: https://ccusageshare-leaderboard.vercel.app

### Convex
Deploy Convex functions from the `packages/web` directory:

```bash
cd packages/web
npx convex deploy --yes
```

## Project Structure

- `/packages/web` - Next.js web app with Convex backend
- `/packages/cli` - CLI tool for parsing Claude Code usage

## Security

The `/api/sync` endpoint requires API key authentication:
- Users sign in with GitHub OAuth
- API key is auto-generated on first visit to `/setup`
- Keys are stored locally and can be rotated
- Only authenticated users can sync their own stats

### Validation Limits
- Max daily tokens: 1B (1,000,000,000)
- Max daily cost: $100,000

## Environment Variables (Vercel)

Required env vars in the `ccusageshare-leaderboard` Vercel project:
- `NEXT_PUBLIC_CONVEX_URL` - Convex deployment URL
- `AUTH_GITHUB_ID` - GitHub OAuth app client ID
- `AUTH_GITHUB_SECRET` - GitHub OAuth app secret
- `AUTH_SECRET` - NextAuth secret

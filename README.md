# ccrank

Claude Code usage leaderboard - track and compare usage across developers.

## Packages

This monorepo contains:

- **[packages/cli](./packages/cli)** - CLI tool to sync usage stats (`npx github:Kisum/ccrank`)
- **[packages/web](./packages/web)** - Leaderboard web app (Next.js + Convex)

## Quick Start

### View the Leaderboard

Visit [ccusageshare-leaderboard.vercel.app](https://ccusageshare-leaderboard.vercel.app)

### Sync Your Stats

```bash
# One-liner to sync your Claude Code usage
ccusage --json | curl -s -X POST "https://ccusageshare-leaderboard.vercel.app/api/sync?user=YOUR_USERNAME" \
  -H "Content-Type: application/json" -d @-
```

Or use the setup page to get your personalized command: [Setup](https://ccusageshare-leaderboard.vercel.app/setup)

## Development

```bash
# Install dependencies
npm install

# Build CLI
npm run build:cli

# Run web app locally
npm run dev:web
```

## Documentation

See the [docs](./docs) folder for:
- [API Design](./docs/API_DESIGN.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Quick Start Guide](./docs/QUICKSTART.md)

## License

MIT

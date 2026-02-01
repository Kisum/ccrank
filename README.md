# ccusageshare

CLI tool to sync [ccusage](https://github.com/anthropics/ccusage) stats to a leaderboard API.

## Installation

```bash
npm install -g ccusageshare
```

## Quick Start

```bash
# 1. Login with your API key from Slack
ccusageshare login

# 2. Sync your stats
ccusageshare sync

# Or pipe from ccusage directly
ccusage daily --json | ccusageshare sync --stdin
```

## Commands

### `ccusageshare login`

Authenticate with your API key obtained from the Slack bot.

**How to get your API key:**
1. Join the ccusage Slack workspace
2. Send a DM to the bot: `/apikey`
3. Copy the API key and use it during login

**What it does:**
- Prompts for your username (display name)
- Securely stores your API key in `~/.ccusageshare/config.json`
- Validates API key format

### `ccusageshare sync`

Upload your ccusage stats to the leaderboard.

**Options:**
- `--stdin` - Read JSON from stdin (for piping)
- `--period <period>` - Period to sync: daily, weekly, monthly (default: daily)
- `--dry-run` - Preview what would be synced without uploading

**Examples:**

```bash
# Sync daily stats (runs ccusage internally)
ccusageshare sync

# Sync weekly stats
ccusageshare sync --period weekly

# Pipe from ccusage
ccusage daily --json | ccusageshare sync --stdin

# Preview without uploading
ccusageshare sync --dry-run
```

### `ccusageshare status`

Show current authentication status and configuration.

```bash
ccusageshare status
```

### `ccusageshare logout`

Clear stored credentials from your local config.

```bash
ccusageshare logout
```

## Configuration

Configuration is stored in `~/.ccusageshare/config.json`:

```json
{
  "apiKey": "your-api-key-from-slack",
  "username": "your-display-name",
  "apiEndpoint": "https://api.ccusageleaderboard.com/v1/sync"
}
```

**Security:**
- Config file has restricted permissions (0600)
- Config directory has restricted permissions (0700)
- API key is never logged or displayed in full

## How It Works

### Data Flow

1. **Input**: Reads ccusage JSON output (either from stdin or by running ccusage)
2. **Transform**: Converts daily usage data to leaderboard entries
3. **Upload**: Posts entries to the leaderboard API with authentication
4. **Response**: Displays sync results and leaderboard URL

### Data Transformation

ccusage output:
```json
{
  "daily": [
    {
      "date": "2025-12-21",
      "inputTokens": 19756,
      "outputTokens": 448,
      "cacheCreationTokens": 583432,
      "cacheReadTokens": 11077641,
      "totalTokens": 11681277,
      "totalCost": 9.295250500000005,
      "modelsUsed": ["claude-opus-4-5-20251101"],
      "modelBreakdowns": [...]
    }
  ]
}
```

Transformed to:
```json
{
  "entries": [
    {
      "username": "your-username",
      "date": "2025-12-21",
      "totalTokens": 11681277,
      "totalCost": 9.295250500000005,
      "inputTokens": 19756,
      "outputTokens": 448,
      "cacheCreationTokens": 583432,
      "cacheReadTokens": 11077641,
      "modelsUsed": ["claude-opus-4-5-20251101"],
      "timestamp": "2025-12-21T10:30:00.000Z"
    }
  ],
  "source": "ccusage",
  "version": "1.0.0"
}
```

## API Endpoint Design

### POST `/v1/sync`

Upload leaderboard entries.

**Headers:**
```
Authorization: Bearer <api-key>
Content-Type: application/json
User-Agent: ccusageshare/1.0.0
```

**Request Body:**
```json
{
  "entries": [
    {
      "username": "string",
      "date": "string (YYYY-MM-DD)",
      "totalTokens": "number",
      "totalCost": "number",
      "inputTokens": "number",
      "outputTokens": "number",
      "cacheCreationTokens": "number",
      "cacheReadTokens": "number",
      "modelsUsed": ["string"],
      "timestamp": "string (ISO 8601)"
    }
  ],
  "source": "ccusage",
  "version": "string"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Successfully synced 10 entries",
  "entriesProcessed": 10,
  "leaderboardUrl": "https://leaderboard.ccusage.com/user/yourname"
}
```

**Error Responses:**
- `401 Unauthorized` - Invalid or missing API key
- `403 Forbidden` - API key doesn't have permission
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/ccusageshare.git
cd ccusageshare

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm run dev -- sync --dry-run

# Link for local testing
npm link
ccusageshare status
```

## Programmatic Usage

You can also use ccusageshare as a library:

```typescript
import { syncCommand, loginCommand } from 'ccusageshare';

// Sync programmatically
await syncCommand({ stdin: false, period: 'daily' });
```

## Troubleshooting

### "Not authenticated" error

Run `ccusageshare login` to authenticate first.

### "ccusage command not found"

Install ccusage: `npm install -g ccusage`

### Network errors

Check your internet connection and verify the API endpoint is accessible.

### "Invalid ccusage data format"

Ensure you're piping valid JSON from ccusage with the `--json` flag.

## Privacy & Security

- API keys are stored locally with restricted file permissions
- No data is collected beyond what you explicitly sync
- All communication uses HTTPS
- API keys are never logged or displayed in full

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR on GitHub.

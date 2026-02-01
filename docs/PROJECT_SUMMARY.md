# ccusageshare - Project Summary

## Overview

**ccusageshare** is a CLI tool that syncs Claude Code usage statistics from `ccusage` to a centralized leaderboard API. It enables users to track and compare their usage across a community.

## Project Structure

```
ccusageshare/
├── src/
│   ├── cli.ts                 # Main CLI entry point with Commander.js
│   ├── index.ts              # Public API exports
│   ├── types.ts              # TypeScript type definitions
│   ├── config.ts             # Config file management (~/.ccusageshare/config.json)
│   ├── transformer.ts        # ccusage JSON → Leaderboard entries
│   ├── api.ts                # HTTP client for leaderboard API
│   └── commands/
│       ├── login.ts          # Login command (store API key)
│       ├── logout.ts         # Logout command (clear config)
│       ├── status.ts         # Status command (show config)
│       └── sync.ts           # Sync command (upload stats)
│
├── package.json              # NPM package configuration
├── tsconfig.json             # TypeScript compiler config
├── .gitignore               # Git ignore patterns
├── .npmignore               # NPM ignore patterns
├── LICENSE                  # MIT License
│
├── README.md                # Main documentation
├── QUICKSTART.md           # Quick start guide
├── EXAMPLES.md             # Usage examples
├── API_DESIGN.md           # Backend API specification
└── ARCHITECTURE.md         # System architecture docs
```

## Key Features

### 1. Authentication
- Slack bot provides API keys via `/apikey` command
- Credentials stored locally in `~/.ccusageshare/config.json`
- Secure file permissions (0600 for file, 0700 for directory)

### 2. Data Synchronization
- Reads ccusage JSON output (piped or internal execution)
- Transforms daily usage into leaderboard entries
- Uploads to API with Bearer token authentication
- Supports dry-run mode for testing

### 3. CLI Commands

```bash
ccusageshare login              # Authenticate
ccusageshare sync               # Sync stats
ccusageshare sync --stdin       # Read from pipe
ccusageshare sync --dry-run     # Preview without upload
ccusageshare status             # Show config
ccusageshare logout             # Clear credentials
```

### 4. Data Flow

```
ccusage → JSON → Transformer → API Client → Leaderboard API → Database
```

## Configuration Format

**File:** `~/.ccusageshare/config.json`

```json
{
  "apiKey": "ccusage_live_abc123...",
  "username": "alice",
  "apiEndpoint": "https://api.ccusageleaderboard.com/v1/sync"
}
```

## API Endpoint Design

### POST `/v1/sync`

**Request:**
```json
{
  "entries": [
    {
      "username": "alice",
      "date": "2025-12-21",
      "totalTokens": 11681277,
      "totalCost": 9.30,
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

**Response:**
```json
{
  "success": true,
  "message": "Successfully synced 10 entries",
  "entriesProcessed": 10,
  "leaderboardUrl": "https://leaderboard.ccusage.com/user/alice"
}
```

## Data Transformation

### Input (ccusage JSON)

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

### Output (Leaderboard Entries)

```typescript
interface LeaderboardEntry {
  username: string;           // From config
  date: string;               // From ccusage
  totalTokens: number;        // From ccusage
  totalCost: number;          // From ccusage
  inputTokens: number;        // From ccusage
  outputTokens: number;       // From ccusage
  cacheCreationTokens: number;// From ccusage
  cacheReadTokens: number;    // From ccusage
  modelsUsed: string[];       // From ccusage
  timestamp: string;          // Current time
}
```

## Dependencies

### Production
- **commander**: CLI framework
- **axios**: HTTP client
- **chalk**: Terminal colors
- **ora**: Loading spinners

### Development
- **typescript**: Type safety
- **ts-node**: TypeScript execution
- **@types/node**: Node.js types

## Backend Database Schema

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  api_key_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_sync_at TIMESTAMP
);

CREATE TABLE leaderboard_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  total_tokens BIGINT NOT NULL,
  total_cost DECIMAL(10, 6) NOT NULL,
  input_tokens BIGINT DEFAULT 0,
  output_tokens BIGINT DEFAULT 0,
  cache_creation_tokens BIGINT DEFAULT 0,
  cache_read_tokens BIGINT DEFAULT 0,
  models_used TEXT[],
  synced_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_leaderboard_date ON leaderboard_entries(date DESC);
CREATE INDEX idx_leaderboard_user ON leaderboard_entries(user_id);
CREATE INDEX idx_leaderboard_cost ON leaderboard_entries(total_cost DESC);
```

## Security Features

### Client-Side
- Secure file permissions (0600/0700)
- API key validation before sending
- HTTPS-only communication
- Never log full API keys

### Server-Side
- API key hashing (bcrypt)
- Bearer token authentication
- Rate limiting (100 req/hour)
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- Request size limits (10 MB)

## Usage Examples

### Basic Sync
```bash
# Install
npm install -g ccusageshare

# Login
ccusageshare login

# Sync
ccusageshare sync
```

### Piped Sync
```bash
ccusage daily --json | ccusageshare sync --stdin
```

### Automated Daily Sync
```bash
# Add to crontab
0 23 * * * ccusageshare sync >> ~/logs/ccusageshare.log 2>&1
```

### Programmatic Usage
```typescript
import { syncCommand } from 'ccusageshare';

await syncCommand({
  stdin: false,
  period: 'daily',
  dryRun: false
});
```

## Error Handling

### Client Errors
- **Authentication**: Prompt to re-login
- **Network**: Retry with backoff (max 3 attempts)
- **Invalid Data**: Show validation errors
- **Rate Limit**: Display retry-after time

### Server Errors
- **401 Unauthorized**: Invalid API key
- **403 Forbidden**: Insufficient permissions
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Error**: Server issue

## Monitoring

### Metrics
- Sync success/failure rate
- API response times (p50, p95, p99)
- Error rates by status code
- Active users per day/week/month
- Database query performance

### Logging
```json
{
  "timestamp": "2025-12-21T10:30:00Z",
  "level": "info",
  "command": "sync",
  "entries": 10,
  "duration_ms": 1450,
  "success": true
}
```

## Development Workflow

### Build
```bash
npm run build
```

### Development Mode
```bash
npm run dev -- sync --dry-run
```

### Local Testing
```bash
npm link
ccusageshare status
```

### Publish to NPM
```bash
npm version patch
npm publish
```

## Future Enhancements

### CLI Features
- `ccusageshare leaderboard` - View rankings in terminal
- `ccusageshare stats` - Show personal statistics
- `ccusageshare compare <user>` - Compare with another user
- Auto-update checking

### API Features
- GET `/v1/leaderboard` - Retrieve rankings
- GET `/v1/user/:username` - User stats
- DELETE `/v1/user/data` - GDPR compliance
- Webhook notifications

### Integrations
- Slack notifications
- Discord bot
- GitHub Actions workflow
- VS Code extension

## Documentation Files

- **README.md**: Main documentation and features
- **QUICKSTART.md**: 3-step setup guide
- **EXAMPLES.md**: Practical usage examples
- **API_DESIGN.md**: Complete API specification
- **ARCHITECTURE.md**: System design and diagrams
- **PROJECT_SUMMARY.md**: This file

## License

MIT License - See LICENSE file

## Publishing Checklist

- [ ] Update version in package.json
- [ ] Build TypeScript: `npm run build`
- [ ] Test locally: `npm link`
- [ ] Update CHANGELOG.md
- [ ] Commit changes
- [ ] Create git tag
- [ ] Publish to NPM: `npm publish`
- [ ] Create GitHub release

## Support

- GitHub Issues: Report bugs and feature requests
- Slack: Join the community
- Email: Support contact

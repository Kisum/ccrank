# ccusageshare Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Machine                          │
│                                                                 │
│  ┌──────────────┐                                               │
│  │   ccusage    │  Generates usage stats                        │
│  │   (CLI)      │  --json flag outputs JSON                     │
│  └──────┬───────┘                                               │
│         │                                                        │
│         │ JSON output (pipe or internal exec)                   │
│         ▼                                                        │
│  ┌──────────────────────────────────────────────────┐           │
│  │           ccusageshare (CLI)                     │           │
│  │                                                  │           │
│  │  Commands:                                       │           │
│  │  • login    - Store API key                      │           │
│  │  • sync     - Upload stats                       │           │
│  │  • status   - Show config                        │           │
│  │  • logout   - Clear config                       │           │
│  │                                                  │           │
│  │  Components:                                     │           │
│  │  ┌────────────────────────────────────────────┐ │           │
│  │  │  Config Manager                            │ │           │
│  │  │  ~/.ccusageshare/config.json               │ │           │
│  │  └────────────────────────────────────────────┘ │           │
│  │  ┌────────────────────────────────────────────┐ │           │
│  │  │  Transformer                               │ │           │
│  │  │  ccusage JSON → Leaderboard entries        │ │           │
│  │  └────────────────────────────────────────────┘ │           │
│  │  ┌────────────────────────────────────────────┐ │           │
│  │  │  API Client                                │ │           │
│  │  │  POST to /v1/sync with auth                │ │           │
│  │  └────────────────────────────────────────────┘ │           │
│  └──────────────────┬───────────────────────────────┘           │
│                     │                                            │
└─────────────────────┼────────────────────────────────────────────┘
                      │
                      │ HTTPS POST with Bearer token
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Leaderboard API Server                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  POST /v1/sync                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │ Auth         │→ │ Validation   │→ │ Storage      │  │   │
│  │  │ Middleware   │  │ Middleware   │  │ Handler      │  │   │
│  │  └──────────────┘  └──────────────┘  └──────┬───────┘  │   │
│  └────────────────────────────────────────────────┼──────────┘   │
│                                                   │              │
│  ┌────────────────────────────────────────────────▼──────────┐   │
│  │               PostgreSQL Database                        │   │
│  │                                                          │   │
│  │  Tables:                                                 │   │
│  │  • users (id, username, api_key_hash)                    │   │
│  │  • leaderboard_entries (user_id, date, tokens, cost)    │   │
│  │                                                          │   │
│  │  Indexes:                                                │   │
│  │  • idx_leaderboard_date                                  │   │
│  │  • idx_leaderboard_user                                  │   │
│  │  • idx_leaderboard_cost                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               Redis Cache                                │   │
│  │  • Rate limiting counters                                │   │
│  │  • API key validation cache                              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                      │
                      │ Query results
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Leaderboard Web UI                             │
│                                                                 │
│  • View rankings by cost/tokens                                │
│  • Daily/Weekly/Monthly/All-time periods                       │
│  • User profiles and stats                                     │
│  • Model usage breakdowns                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Authentication Flow

```
User                CLI                Config File           Slack Bot
  │                  │                     │                     │
  │  ccusageshare   │                     │                     │
  │    login        │                     │                     │
  ├────────────────>│                     │                     │
  │                  │                     │                     │
  │  "Get API key   │                     │                     │
  │   from Slack"   │                     │                     │
  │<─────────────────┤                     │                     │
  │                  │                     │                     │
  │  /apikey        │                     │                     │
  ├─────────────────────────────────────────────────────────────>│
  │                  │                     │                     │
  │  <api_key>      │                     │                     │
  │<─────────────────────────────────────────────────────────────┤
  │                  │                     │                     │
  │  Enter username │                     │                     │
  │  Enter API key  │                     │                     │
  ├────────────────>│                     │                     │
  │                  │                     │                     │
  │                  │  Write config      │                     │
  │                  │  (apiKey, username)│                     │
  │                  ├────────────────────>│                     │
  │                  │                     │                     │
  │  "Login         │                     │                     │
  │   successful"   │                     │                     │
  │<─────────────────┤                     │                     │
```

### 2. Sync Flow (Internal ccusage execution)

```
User               CLI              ccusage           Transformer        API Client        Backend
  │                 │                   │                  │                 │                │
  │  ccusageshare  │                   │                  │                 │                │
  │    sync         │                   │                  │                 │                │
  ├────────────────>│                   │                  │                 │                │
  │                 │                   │                  │                 │                │
  │                 │  exec ccusage    │                  │                 │                │
  │                 │   daily --json   │                  │                 │                │
  │                 ├──────────────────>│                  │                 │                │
  │                 │                   │                  │                 │                │
  │                 │  JSON output     │                  │                 │                │
  │                 │<──────────────────┤                  │                 │                │
  │                 │                   │                  │                 │                │
  │                 │  Transform data  │                  │                 │                │
  │                 ├──────────────────────────────────────>│                 │                │
  │                 │                   │                  │                 │                │
  │                 │  Leaderboard entries                 │                 │                │
  │                 │<──────────────────────────────────────┤                 │                │
  │                 │                   │                  │                 │                │
  │                 │  POST /v1/sync   │                  │                 │                │
  │                 │  (with Bearer token)                 │                 │                │
  │                 ├──────────────────────────────────────────────────────>│                │
  │                 │                   │                  │                 │                │
  │                 │                   │                  │                 │  Authenticate  │
  │                 │                   │                  │                 │  Validate      │
  │                 │                   │                  │                 │  Store entries │
  │                 │                   │                  │                 ├───────────────>│
  │                 │                   │                  │                 │                │
  │                 │                   │                  │                 │  Response      │
  │                 │                   │                  │                 │<───────────────┤
  │                 │                   │                  │                 │                │
  │                 │  Success response│                  │                 │                │
  │                 │<──────────────────────────────────────────────────────┤                │
  │                 │                   │                  │                 │                │
  │  "Sync         │                   │                  │                 │                │
  │   successful"   │                   │                  │                 │                │
  │<─────────────────┤                   │                  │                 │                │
```

### 3. Sync Flow (Piped stdin)

```
User               ccusage           CLI              Transformer        API Client        Backend
  │                   │                │                  │                 │                │
  │  ccusage daily   │                │                  │                 │                │
  │   --json |       │                │                  │                 │                │
  │  ccusageshare   │                │                  │                 │                │
  │   sync --stdin   │                │                  │                 │                │
  ├──────────────────>│                │                  │                 │                │
  │                   │                │                  │                 │                │
  │                   │  JSON output  │                  │                 │                │
  │                   │  (via pipe)   │                  │                 │                │
  │                   ├───────────────>│                  │                 │                │
  │                   │                │                  │                 │                │
  │                   │                │  Read stdin     │                 │                │
  │                   │                │  Parse JSON     │                 │                │
  │                   │                │                  │                 │                │
  │                   │                │  Transform data │                 │                │
  │                   │                ├─────────────────>│                 │                │
  │                   │                │                  │                 │                │
  │                   │                │  Entries        │                 │                │
  │                   │                │<─────────────────┤                 │                │
  │                   │                │                  │                 │                │
  │                   │                │  POST /v1/sync  │                 │                │
  │                   │                ├─────────────────────────────────>│                │
  │                   │                │                  │                 │                │
  │                   │                │                  │                 │  Store data   │
  │                   │                │                  │                 ├───────────────>│
  │                   │                │                  │                 │                │
  │                   │                │  Response       │                 │                │
  │                   │                │<─────────────────────────────────┤                │
  │                   │                │                  │                 │                │
  │  "Sync successful"│                │                  │                 │                │
  │<───────────────────────────────────┤                  │                 │                │
```

## Component Details

### CLI Components

#### 1. Config Manager (`src/config.ts`)
**Responsibilities:**
- Read/write configuration to `~/.ccusageshare/config.json`
- Ensure secure file permissions (0600 for file, 0700 for directory)
- Validate configuration structure
- Provide authentication checks

**Key Functions:**
- `readConfig()`: Load config from disk
- `writeConfig(config)`: Save config to disk
- `requireAuth()`: Get config or throw if not authenticated
- `clearConfig()`: Delete config file

#### 2. Transformer (`src/transformer.ts`)
**Responsibilities:**
- Convert ccusage JSON to leaderboard entry format
- Validate ccusage data structure
- Calculate summary statistics

**Key Functions:**
- `transformToLeaderboardEntries(data, username)`: Transform daily usage to entries
- `validateCCUsageData(data)`: Check if data is valid ccusage output
- `getSummaryStats(data)`: Calculate totals and counts

#### 3. API Client (`src/api.ts`)
**Responsibilities:**
- Communicate with leaderboard backend
- Handle authentication headers
- Process API responses and errors
- Implement retry logic

**Key Functions:**
- `syncToLeaderboard(entries, apiKey, endpoint)`: POST entries to API
- `validateApiKey(key)`: Check API key format
- `testConnection(apiKey, endpoint)`: Verify authentication

#### 4. Commands (`src/commands/`)

**login.ts:**
- Interactive prompts for username and API key
- Hidden input for API key (security)
- Save credentials to config file

**sync.ts:**
- Execute ccusage or read from stdin
- Transform and upload data
- Display progress with spinners
- Show summary statistics

**status.ts:**
- Display authentication status
- Show masked API key
- List available commands

**logout.ts:**
- Clear stored credentials
- Confirm logout action

### Backend Components

#### 1. Authentication Middleware
**Responsibilities:**
- Extract Bearer token from Authorization header
- Validate API key against database (with caching)
- Attach user object to request

**Implementation:**
```typescript
async function authenticate(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);
  const user = await validateApiKey(token);
  if (!user) return res.status(401).json({...});
  req.user = user;
  next();
}
```

#### 2. Validation Middleware
**Responsibilities:**
- Validate request body structure
- Check required fields
- Validate data types and ranges
- Sanitize inputs

**Validation Rules:**
- `username`: 3-50 chars, alphanumeric + underscore/hyphen
- `date`: YYYY-MM-DD format, not in future
- `totalTokens`: Non-negative number
- `totalCost`: Non-negative number

#### 3. Storage Handler
**Responsibilities:**
- Upsert leaderboard entries (unique on user_id + date)
- Update user's last_sync_at timestamp
- Handle database transactions
- Return success/error responses

**Database Operations:**
```sql
INSERT INTO leaderboard_entries (
  user_id, date, total_tokens, total_cost, ...
)
VALUES (?, ?, ?, ?, ...)
ON CONFLICT (user_id, date)
DO UPDATE SET
  total_tokens = EXCLUDED.total_tokens,
  total_cost = EXCLUDED.total_cost,
  updated_at = NOW();
```

#### 4. Rate Limiter
**Responsibilities:**
- Track requests per API key
- Enforce rate limits (100 req/hour)
- Return 429 with retry-after header

**Implementation:**
- Redis counter: `rate_limit:{api_key}`
- TTL: 1 hour
- Increment on each request
- Check before processing

## Security Architecture

### API Key Security

**Generation:**
```
Format: ccusage_live_{base64(random(32 bytes))}
Example: ccusage_live_4k9X2mPz8QwY5NvR3jL6hT1sF0dC8bA9...
```

**Storage:**
- Client: Plain text in `~/.ccusageshare/config.json` (0600 permissions)
- Server: bcrypt hash in database

**Validation:**
```typescript
async function validateApiKey(key: string): Promise<User | null> {
  // Check cache first
  const cached = await redis.get(`apikey:${key}`);
  if (cached) return JSON.parse(cached);

  // Query database
  const user = await db.query(
    'SELECT * FROM users WHERE api_key_hash = $1',
    [bcrypt.hashSync(key, SALT)]
  );

  // Cache for 5 minutes
  if (user) {
    await redis.setex(`apikey:${key}`, 300, JSON.stringify(user));
  }

  return user;
}
```

### Data Privacy

**Config File Permissions:**
```bash
# Directory: 0700 (drwx------)
# Only owner can read/write/execute

# File: 0600 (-rw-------)
# Only owner can read/write
```

**HTTPS Only:**
- All API communication over TLS 1.2+
- Certificate pinning recommended
- Reject HTTP connections

**Input Sanitization:**
- Escape HTML in username
- Validate JSON structure
- Limit payload size (10 MB)
- Prevent SQL injection via parameterized queries

## Scalability Considerations

### Database Optimization

**Indexes:**
```sql
CREATE INDEX idx_leaderboard_date ON leaderboard_entries(date DESC);
CREATE INDEX idx_leaderboard_user ON leaderboard_entries(user_id);
CREATE INDEX idx_leaderboard_cost ON leaderboard_entries(total_cost DESC);
CREATE INDEX idx_users_username ON users(username);
```

**Partitioning:**
```sql
-- Partition by month for time-series data
CREATE TABLE leaderboard_entries (...)
PARTITION BY RANGE (date);

CREATE TABLE leaderboard_entries_2025_12
PARTITION OF leaderboard_entries
FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
```

### Caching Strategy

**Redis Cache Layers:**
1. API key validation (5 min TTL)
2. Rate limit counters (1 hour TTL)
3. Leaderboard rankings (15 min TTL)
4. User stats (10 min TTL)

### Horizontal Scaling

**Stateless API Servers:**
- Load balancer distributes requests
- Session data in Redis (shared)
- Database connection pooling

**Database Replication:**
- Primary for writes
- Read replicas for queries
- Connection routing by query type

## Monitoring & Observability

### Metrics to Track

**CLI Metrics:**
- Sync success/failure rate
- Average sync duration
- Common error types
- Version distribution

**API Metrics:**
- Request rate (req/sec)
- Error rate by status code
- Response time (p50, p95, p99)
- Database query time
- Cache hit rate

### Logging

**CLI Logs:**
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

**API Logs:**
```json
{
  "timestamp": "2025-12-21T10:30:00Z",
  "level": "info",
  "method": "POST",
  "path": "/v1/sync",
  "username": "alice",
  "entries_count": 10,
  "response_status": 200,
  "response_time_ms": 145,
  "ip": "203.0.113.42"
}
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                        │
│                    (Nginx/HAProxy)                      │
└────────────┬─────────────────────┬──────────────────────┘
             │                     │
      ┌──────▼──────┐       ┌──────▼──────┐
      │  API Server │       │  API Server │
      │  (Node.js)  │       │  (Node.js)  │
      └──────┬──────┘       └──────┬──────┘
             │                     │
             └──────────┬──────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    ┌────▼────┐    ┌────▼────┐   ┌────▼────┐
    │PostgreSQL│    │ Redis   │   │  S3     │
    │ Primary  │    │ Cache   │   │ Backups │
    └────┬────┘    └─────────┘   └─────────┘
         │
    ┌────▼────┐
    │PostgreSQL│
    │ Replica  │
    └─────────┘
```

## Error Handling

### Client-side Errors

**Network Errors:**
- Retry with exponential backoff
- Max 3 retries
- Display helpful error messages

**Invalid Data:**
- Validate before sending
- Show specific validation errors
- Suggest fixes to user

**Authentication Errors:**
- Prompt to re-login
- Clear invalid credentials
- Show login instructions

### Server-side Errors

**Database Errors:**
- Transaction rollback
- Log error details
- Return generic error to client

**Validation Errors:**
- Return specific field errors
- HTTP 400 Bad Request
- Include error details in response

**Rate Limiting:**
- Return 429 status
- Include Retry-After header
- Log rate limit violations

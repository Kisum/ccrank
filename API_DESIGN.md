# ccusageshare API Design

This document describes the backend API that `ccusageshare` communicates with.

## Overview

The leaderboard API receives usage statistics from ccusageshare clients and maintains a leaderboard of Claude Code usage across users.

**Base URL:** `https://api.ccusageleaderboard.com`

## Authentication

All API requests require authentication using an API key provided via Slack bot.

**Header:**
```
Authorization: Bearer <api-key>
```

### Getting an API Key

Users obtain API keys through the Slack bot:
1. Join the ccusage Slack workspace
2. Send DM to bot: `/apikey`
3. Bot responds with a unique API key

## Endpoints

### POST `/v1/sync`

Upload usage statistics to the leaderboard.

#### Request

**Headers:**
```
Authorization: Bearer <api-key>
Content-Type: application/json
User-Agent: ccusageshare/<version>
```

**Body:**
```typescript
{
  "entries": Array<{
    username: string;           // User's display name
    date: string;               // YYYY-MM-DD format
    totalTokens: number;        // Total tokens used
    totalCost: number;          // Total cost in USD
    inputTokens: number;        // Input tokens
    outputTokens: number;       // Output tokens
    cacheCreationTokens: number; // Cache creation tokens
    cacheReadTokens: number;    // Cache read tokens
    modelsUsed: string[];       // Array of model names
    timestamp: string;          // ISO 8601 timestamp
  }>;
  source: "ccusage";           // Data source identifier
  version: string;             // Client version
}
```

**Example:**
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

#### Response

**Success (200 OK):**
```json
{
  "success": true,
  "message": "Successfully synced 10 entries",
  "entriesProcessed": 10,
  "leaderboardUrl": "https://leaderboard.ccusage.com/user/alice"
}
```

**Error Responses:**

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Invalid or missing API key",
  "code": "UNAUTHORIZED"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "message": "API key does not have permission to sync data",
  "code": "FORBIDDEN"
}
```

**429 Too Many Requests:**
```json
{
  "success": false,
  "message": "Rate limit exceeded. Try again in 60 seconds",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Invalid request body",
  "code": "INVALID_REQUEST",
  "errors": [
    {
      "field": "entries[0].date",
      "message": "Invalid date format. Expected YYYY-MM-DD"
    }
  ]
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "message": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```

## Data Processing

### Duplicate Handling

The API should handle duplicate entries intelligently:

1. **Unique Key:** `(username, date)`
2. **Strategy:** Latest timestamp wins (upsert behavior)
3. **Rationale:** Users may re-sync the same day with updated data

### Validation Rules

**Required Fields:**
- `username`: 3-50 characters, alphanumeric + underscore/hyphen
- `date`: Valid YYYY-MM-DD format, not in the future
- `totalTokens`: Non-negative number
- `totalCost`: Non-negative number
- `timestamp`: Valid ISO 8601 timestamp

**Optional Fields:**
- All token breakdown fields (default to 0)
- `modelsUsed` (default to empty array)

### Data Storage Schema

```sql
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

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  api_key_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_sync_at TIMESTAMP
);

CREATE INDEX idx_leaderboard_date ON leaderboard_entries(date DESC);
CREATE INDEX idx_leaderboard_user ON leaderboard_entries(user_id);
CREATE INDEX idx_leaderboard_cost ON leaderboard_entries(total_cost DESC);
```

## Rate Limiting

**Limits:**
- 100 requests per hour per API key
- 1000 entries per sync request
- 10 MB maximum request body size

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

## Security Considerations

### API Key Management

1. **Generation:** Cryptographically secure random strings (256 bits)
2. **Storage:** Hashed using bcrypt before storing in database
3. **Format:** `ccusage_live_<base64-encoded-random-bytes>`
4. **Revocation:** Users can regenerate keys via Slack bot

### Request Validation

1. **Content-Type:** Must be `application/json`
2. **Body Size:** Max 10 MB
3. **Schema Validation:** Strict validation against expected schema
4. **SQL Injection:** Use parameterized queries
5. **XSS Prevention:** Sanitize username and text fields

### HTTPS Only

All API endpoints must be accessed via HTTPS. HTTP requests should be rejected.

## Monitoring & Analytics

### Metrics to Track

- Total syncs per day/week/month
- Active users
- Average entries per sync
- Error rates by status code
- API latency (p50, p95, p99)
- Top users by cost
- Most used models

### Logging

Log the following for each request:
```json
{
  "timestamp": "2025-12-21T10:30:00.000Z",
  "method": "POST",
  "path": "/v1/sync",
  "username": "alice",
  "entriesCount": 10,
  "responseStatus": 200,
  "responseTime": 145,
  "userAgent": "ccusageshare/1.0.0",
  "ipAddress": "203.0.113.42"
}
```

## Future Endpoints

### GET `/v1/leaderboard`

Retrieve leaderboard rankings.

**Query Parameters:**
- `period`: daily, weekly, monthly, all-time
- `metric`: tokens, cost
- `limit`: number of entries (default: 100, max: 1000)
- `offset`: pagination offset

**Response:**
```json
{
  "period": "weekly",
  "metric": "cost",
  "updated_at": "2025-12-21T10:30:00.000Z",
  "entries": [
    {
      "rank": 1,
      "username": "alice",
      "totalCost": 1234.56,
      "totalTokens": 50000000,
      "daysCounted": 7,
      "topModel": "claude-opus-4-5-20251101"
    }
  ]
}
```

### GET `/v1/user/:username`

Get detailed stats for a specific user.

**Response:**
```json
{
  "username": "alice",
  "totalDays": 45,
  "totalCost": 5432.10,
  "totalTokens": 250000000,
  "averageDailyCost": 120.71,
  "topModel": "claude-opus-4-5-20251101",
  "firstSync": "2025-11-01",
  "lastSync": "2025-12-21",
  "recentActivity": [...]
}
```

### DELETE `/v1/user/data`

Allow users to delete their data (GDPR compliance).

**Headers:**
```
Authorization: Bearer <api-key>
```

**Response:**
```json
{
  "success": true,
  "message": "All data deleted successfully",
  "entriesDeleted": 45
}
```

## Implementation Recommendations

### Technology Stack

**Backend:**
- Node.js + Express or Python + FastAPI
- PostgreSQL for data storage
- Redis for rate limiting and caching
- JWT or API key authentication

**Deployment:**
- Docker containers
- Kubernetes or similar for orchestration
- Load balancer for high availability
- CDN for static leaderboard page

### Error Handling

1. Always return JSON responses
2. Include helpful error messages
3. Log all errors with context
4. Never expose internal implementation details
5. Return appropriate HTTP status codes

### Testing

**Unit Tests:**
- Request validation
- Authentication logic
- Data transformation
- Duplicate handling

**Integration Tests:**
- End-to-end sync flow
- Rate limiting
- Database operations
- Error scenarios

**Load Tests:**
- Simulate concurrent syncs
- Test rate limiting behavior
- Verify database performance

## Example Implementation (Express)

```typescript
import express from 'express';
import { body, validationResult } from 'express-validator';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Authentication middleware
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or missing API key',
      code: 'UNAUTHORIZED'
    });
  }

  const apiKey = authHeader.substring(7);
  const user = await validateApiKey(apiKey);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or missing API key',
      code: 'UNAUTHORIZED'
    });
  }

  req.user = user;
  next();
};

// Rate limiting middleware
const rateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: {
    success: false,
    message: 'Rate limit exceeded',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// Sync endpoint
app.post('/v1/sync',
  authenticate,
  rateLimiter,
  [
    body('entries').isArray().notEmpty(),
    body('entries.*.username').isString().isLength({ min: 3, max: 50 }),
    body('entries.*.date').isDate(),
    body('entries.*.totalTokens').isNumeric(),
    body('entries.*.totalCost').isNumeric(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body',
        code: 'INVALID_REQUEST',
        errors: errors.array()
      });
    }

    try {
      const { entries } = req.body;
      const processed = await processEntries(req.user, entries);

      res.json({
        success: true,
        message: `Successfully synced ${processed} entries`,
        entriesProcessed: processed,
        leaderboardUrl: `https://leaderboard.ccusage.com/user/${req.user.username}`
      });
    } catch (error) {
      console.error('Sync error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);
```

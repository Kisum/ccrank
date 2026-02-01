# ccusageshare Implementation Guide

## Step-by-Step Implementation

This guide walks through implementing the complete ccusageshare system from scratch.

---

## Phase 1: CLI Development

### Step 1.1: Project Setup

```bash
# Create project directory
mkdir ccusageshare
cd ccusageshare

# Initialize npm project
npm init -y

# Install dependencies
npm install commander axios chalk ora

# Install dev dependencies
npm install -D typescript ts-node @types/node

# Initialize TypeScript
npx tsc --init
```

### Step 1.2: Create Source Structure

```bash
mkdir -p src/commands
touch src/{cli,index,types,config,transformer,api}.ts
touch src/commands/{login,logout,status,sync}.ts
```

### Step 1.3: Implement Core Modules

**Order of implementation:**
1. `types.ts` - Define interfaces
2. `config.ts` - Config file management
3. `transformer.ts` - Data transformation
4. `api.ts` - HTTP client
5. `commands/*.ts` - Individual commands
6. `cli.ts` - CLI entry point
7. `index.ts` - Public exports

### Step 1.4: Build and Test

```bash
# Build TypeScript
npm run build

# Test locally
npm link
ccusageshare --help
ccusageshare sync --dry-run
```

---

## Phase 2: Backend API Development

### Step 2.1: Choose Technology Stack

**Recommended Stack:**
- **Runtime**: Node.js 18+ or Python 3.10+
- **Framework**: Express.js or FastAPI
- **Database**: PostgreSQL 14+
- **Cache**: Redis 6+
- **Auth**: API key (Bearer token)

### Step 2.2: Database Setup

```sql
-- Create database
CREATE DATABASE ccusage_leaderboard;

-- Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  api_key_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_sync_at TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);

-- Create leaderboard_entries table
CREATE TABLE leaderboard_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_tokens BIGINT NOT NULL CHECK (total_tokens >= 0),
  total_cost DECIMAL(10, 6) NOT NULL CHECK (total_cost >= 0),
  input_tokens BIGINT DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens BIGINT DEFAULT 0 CHECK (output_tokens >= 0),
  cache_creation_tokens BIGINT DEFAULT 0 CHECK (cache_creation_tokens >= 0),
  cache_read_tokens BIGINT DEFAULT 0 CHECK (cache_read_tokens >= 0),
  models_used TEXT[] DEFAULT '{}',
  synced_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Create indexes
CREATE INDEX idx_leaderboard_date ON leaderboard_entries(date DESC);
CREATE INDEX idx_leaderboard_user ON leaderboard_entries(user_id);
CREATE INDEX idx_leaderboard_cost ON leaderboard_entries(total_cost DESC);
CREATE INDEX idx_leaderboard_tokens ON leaderboard_entries(total_tokens DESC);
CREATE INDEX idx_users_username ON users(username);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leaderboard_entries_updated_at
  BEFORE UPDATE ON leaderboard_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Step 2.3: Express.js Server Implementation

```typescript
// server.ts
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import Redis from 'ioredis';
import bcrypt from 'bcrypt';

const app = express();
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiter
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Rate limit exceeded. Try again in 60 seconds',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 60
    });
  }
});

// Authentication middleware
async function authenticate(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or missing API key',
      code: 'UNAUTHORIZED'
    });
  }

  const apiKey = authHeader.substring(7);
  
  // Check cache first
  const cached = await redis.get(`apikey:${apiKey}`);
  if (cached) {
    req.user = JSON.parse(cached);
    return next();
  }

  // Query database
  const result = await db.query(
    'SELECT * FROM users WHERE is_active = true',
  );

  let user = null;
  for (const u of result.rows) {
    if (await bcrypt.compare(apiKey, u.api_key_hash)) {
      user = u;
      break;
    }
  }

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or missing API key',
      code: 'UNAUTHORIZED'
    });
  }

  // Cache for 5 minutes
  await redis.setex(`apikey:${apiKey}`, 300, JSON.stringify(user));
  
  req.user = user;
  next();
}

// Sync endpoint
app.post('/v1/sync', authenticate, limiter, async (req, res) => {
  try {
    const { entries, source, version } = req.body;

    // Validate
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: entries must be a non-empty array',
        code: 'INVALID_REQUEST'
      });
    }

    if (entries.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Too many entries. Maximum 1000 per request',
        code: 'TOO_MANY_ENTRIES'
      });
    }

    // Process entries
    let processed = 0;
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      for (const entry of entries) {
        await client.query(`
          INSERT INTO leaderboard_entries (
            user_id, date, total_tokens, total_cost,
            input_tokens, output_tokens,
            cache_creation_tokens, cache_read_tokens,
            models_used, synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (user_id, date)
          DO UPDATE SET
            total_tokens = EXCLUDED.total_tokens,
            total_cost = EXCLUDED.total_cost,
            input_tokens = EXCLUDED.input_tokens,
            output_tokens = EXCLUDED.output_tokens,
            cache_creation_tokens = EXCLUDED.cache_creation_tokens,
            cache_read_tokens = EXCLUDED.cache_read_tokens,
            models_used = EXCLUDED.models_used,
            synced_at = EXCLUDED.synced_at,
            updated_at = NOW()
        `, [
          req.user.id,
          entry.date,
          entry.totalTokens,
          entry.totalCost,
          entry.inputTokens || 0,
          entry.outputTokens || 0,
          entry.cacheCreationTokens || 0,
          entry.cacheReadTokens || 0,
          entry.modelsUsed || []
        ]);
        processed++;
      }

      // Update last sync time
      await client.query(
        'UPDATE users SET last_sync_at = NOW() WHERE id = $1',
        [req.user.id]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

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
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    await redis.ping();
    res.json({ status: 'healthy' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Step 2.4: Deploy Backend

```bash
# Using Docker
docker build -t ccusage-api .
docker run -p 3000:3000 ccusage-api

# Using Docker Compose
docker-compose up -d

# Using Cloud Provider (example: Heroku)
heroku create ccusage-api
heroku addons:create heroku-postgresql:hobby-dev
heroku addons:create heroku-redis:hobby-dev
git push heroku main
```

---

## Phase 3: Slack Bot Development

### Step 3.1: Create Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App"
3. Choose "From scratch"
4. Name: "ccusage Bot"
5. Select workspace

### Step 3.2: Add Bot Permissions

Required scopes:
- `chat:write` - Send messages
- `commands` - Handle slash commands
- `im:write` - Send DMs

### Step 3.3: Implement Slash Command

```typescript
// slack-bot.ts
import { App } from '@slack/bolt';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Generate API key
function generateApiKey(): string {
  const random = crypto.randomBytes(32).toString('base64url');
  return `ccusage_live_${random}`;
}

// /apikey command
app.command('/apikey', async ({ command, ack, respond }) => {
  await ack();

  try {
    const username = command.user_name;
    const apiKey = generateApiKey();
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    // Upsert user
    await db.query(`
      INSERT INTO users (username, api_key_hash)
      VALUES ($1, $2)
      ON CONFLICT (username)
      DO UPDATE SET api_key_hash = EXCLUDED.api_key_hash
    `, [username, apiKeyHash]);

    await respond({
      response_type: 'ephemeral',
      text: `Your API key:\n\`${apiKey}\`\n\n` +
            `⚠️ Keep this secret! Don't share it.\n\n` +
            `To use it:\n` +
            `1. Run: \`ccusageshare login\`\n` +
            `2. Enter this API key when prompted\n` +
            `3. Start syncing: \`ccusageshare sync\``
    });

  } catch (error) {
    console.error('Error generating API key:', error);
    await respond({
      response_type: 'ephemeral',
      text: 'Error generating API key. Please try again.'
    });
  }
});

// Start bot
(async () => {
  await app.start(process.env.PORT || 3001);
  console.log('⚡️ Slack bot is running!');
})();
```

### Step 3.4: Deploy Slack Bot

```bash
# Set environment variables
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_SIGNING_SECRET=...
export DATABASE_URL=postgresql://...

# Run bot
node slack-bot.js

# Or deploy to Heroku
heroku create ccusage-slack-bot
heroku config:set SLACK_BOT_TOKEN=xoxb-...
git push heroku main
```

---

## Phase 4: Leaderboard UI (Optional)

### Step 4.1: Create Next.js App

```bash
npx create-next-app@latest leaderboard
cd leaderboard
npm install @tanstack/react-query axios recharts
```

### Step 4.2: Implement Leaderboard Page

```typescript
// pages/index.tsx
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export default function Leaderboard() {
  const { data, isLoading } = useQuery(['leaderboard'], async () => {
    const res = await axios.get('/api/leaderboard?period=weekly');
    return res.data;
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="container">
      <h1>ccusage Leaderboard</h1>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Username</th>
            <th>Total Cost</th>
            <th>Total Tokens</th>
            <th>Days</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((entry, idx) => (
            <tr key={entry.username}>
              <td>{idx + 1}</td>
              <td>{entry.username}</td>
              <td>${entry.totalCost.toFixed(2)}</td>
              <td>{entry.totalTokens.toLocaleString()}</td>
              <td>{entry.daysCounted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Phase 5: Testing

### Step 5.1: CLI Unit Tests

```typescript
// tests/transformer.test.ts
import { transformToLeaderboardEntries } from '../src/transformer';

test('transforms ccusage data correctly', () => {
  const input = {
    daily: [{
      date: '2025-12-21',
      totalTokens: 1000,
      totalCost: 0.5,
      inputTokens: 500,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelsUsed: ['claude-3-5-sonnet'],
      modelBreakdowns: []
    }]
  };

  const result = transformToLeaderboardEntries(input, 'alice');

  expect(result).toHaveLength(1);
  expect(result[0].username).toBe('alice');
  expect(result[0].totalTokens).toBe(1000);
});
```

### Step 5.2: API Integration Tests

```typescript
// tests/api.test.ts
import request from 'supertest';
import app from '../src/server';

test('POST /v1/sync requires authentication', async () => {
  const res = await request(app)
    .post('/v1/sync')
    .send({ entries: [] });

  expect(res.status).toBe(401);
});

test('POST /v1/sync syncs data', async () => {
  const res = await request(app)
    .post('/v1/sync')
    .set('Authorization', 'Bearer test-api-key')
    .send({
      entries: [{
        username: 'alice',
        date: '2025-12-21',
        totalTokens: 1000,
        totalCost: 0.5,
        /* ... */
      }],
      source: 'ccusage',
      version: '1.0.0'
    });

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
});
```

---

## Phase 6: Deployment

### Step 6.1: Publish CLI to NPM

```bash
# Login to NPM
npm login

# Publish
npm publish

# Test installation
npm install -g ccusageshare
ccusageshare --version
```

### Step 6.2: Deploy API

```bash
# Deploy to cloud provider
# Example: Railway, Render, Fly.io, Heroku

# Set environment variables
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
PORT=3000
NODE_ENV=production
```

### Step 6.3: Configure DNS

```
api.ccusageleaderboard.com → API server
leaderboard.ccusage.com → Web UI
```

---

## Phase 7: Launch

### Step 7.1: Documentation

- [ ] Update README.md
- [ ] Create tutorial videos
- [ ] Write blog post
- [ ] Setup GitHub Pages

### Step 7.2: Community

- [ ] Create Slack workspace
- [ ] Setup Discord server
- [ ] Launch on Product Hunt
- [ ] Post on Twitter/X

### Step 7.3: Monitoring

- [ ] Setup error tracking (Sentry)
- [ ] Setup analytics (PostHog)
- [ ] Setup uptime monitoring
- [ ] Create status page

---

## Maintenance

### Regular Tasks

**Weekly:**
- Review error logs
- Check API performance
- Monitor rate limit hits
- Review user feedback

**Monthly:**
- Database maintenance (VACUUM)
- Update dependencies
- Review security alerts
- Analyze usage metrics

**Quarterly:**
- Performance optimization
- Feature planning
- User surveys
- Documentation updates

---

## Troubleshooting Common Issues

### Issue: CLI won't install globally

**Solution:**
```bash
# Fix npm permissions
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

### Issue: Database connection errors

**Solution:**
```bash
# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### Issue: Rate limit too aggressive

**Solution:**
```typescript
// Increase limit for trusted users
if (req.user.is_trusted) {
  req.rateLimit.max = 1000;
}
```

---

## Conclusion

This implementation guide provides a complete roadmap for building ccusageshare from scratch. Follow the phases in order, test thoroughly, and iterate based on user feedback.

# ccusageshare Examples

Practical examples of using ccusageshare in various scenarios.

## Basic Usage

### First-time Setup

```bash
# Install globally
npm install -g ccusageshare

# Login with your API key
ccusageshare login
# Enter username: alice
# Enter API key: ccusage_live_abc123...

# Check status
ccusageshare status
```

### Daily Sync

```bash
# Sync today's stats
ccusageshare sync

# Sync weekly stats
ccusageshare sync --period weekly

# Sync monthly stats
ccusageshare sync --period monthly
```

## Piping from ccusage

### Basic Pipe

```bash
# Pipe daily stats
ccusage daily --json | ccusageshare sync --stdin

# Pipe weekly stats
ccusage weekly --json | ccusageshare sync --stdin

# Pipe custom date range
ccusage range 2025-12-01 2025-12-31 --json | ccusageshare sync --stdin
```

### With Filtering

```bash
# Sync only specific model usage
ccusage daily --json | jq '.daily |= map(select(.modelsUsed[] | contains("opus")))' | ccusageshare sync --stdin

# Sync only high-cost days
ccusage daily --json | jq '.daily |= map(select(.totalCost > 10))' | ccusageshare sync --stdin
```

## Automation

### Daily Cron Job

```bash
# Add to crontab (run every day at 11 PM)
crontab -e

# Add this line:
0 23 * * * /usr/local/bin/ccusageshare sync >> ~/logs/ccusageshare.log 2>&1
```

### Weekly Summary Script

Create `~/bin/weekly-sync.sh`:

```bash
#!/bin/bash

# Sync weekly stats every Sunday at midnight
ccusageshare sync --period weekly

# Check exit code
if [ $? -eq 0 ]; then
    echo "Weekly sync completed successfully at $(date)"
else
    echo "Weekly sync failed at $(date)" >&2
    exit 1
fi
```

Make it executable and add to cron:
```bash
chmod +x ~/bin/weekly-sync.sh
crontab -e
# Add: 0 0 * * 0 ~/bin/weekly-sync.sh >> ~/logs/weekly-sync.log 2>&1
```

## Advanced Usage

### Dry Run Before Sync

```bash
# Preview what would be synced
ccusageshare sync --dry-run

# Review the output, then sync for real
ccusageshare sync
```

### Multiple Users on Same Machine

```bash
# User 1
ccusageshare login
# Enter username: alice
# Syncs go to alice's account

# User 2 (different account)
ccusageshare logout
ccusageshare login
# Enter username: bob
# Syncs go to bob's account
```

### Programmatic Usage

Create `sync-script.js`:

```javascript
import { syncCommand } from 'ccusageshare';

async function main() {
  try {
    console.log('Starting sync...');

    await syncCommand({
      stdin: false,
      period: 'daily',
      dryRun: false
    });

    console.log('Sync completed!');
  } catch (error) {
    console.error('Sync failed:', error.message);
    process.exit(1);
  }
}

main();
```

Run it:
```bash
node sync-script.js
```

### Integration with CI/CD

`.github/workflows/sync-usage.yml`:

```yaml
name: Sync ccusage Stats

on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:  # Allow manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Install ccusage
        run: npm install -g ccusage

      - name: Install ccusageshare
        run: npm install -g ccusageshare

      - name: Configure ccusageshare
        run: |
          mkdir -p ~/.ccusageshare
          echo '{
            "apiKey": "${{ secrets.CCUSAGE_API_KEY }}",
            "username": "${{ github.actor }}"
          }' > ~/.ccusageshare/config.json
          chmod 600 ~/.ccusageshare/config.json

      - name: Sync stats
        run: ccusageshare sync --period daily

      - name: Notify on failure
        if: failure()
        run: echo "Sync failed! Check logs."
```

## Data Analysis

### Extract Specific Data Before Sync

```bash
# Get total cost for the month
ccusage monthly --json | jq '.summary.totalCost'

# Get days with highest usage
ccusage daily --json | jq '.daily | sort_by(.totalCost) | reverse | .[0:5]'

# Then sync the data
ccusage daily --json | ccusageshare sync --stdin
```

### Combine Multiple Time Ranges

```bash
# Create a combined JSON file
ccusage range 2025-11-01 2025-11-30 --json > nov.json
ccusage range 2025-12-01 2025-12-31 --json > dec.json

# Merge and sync
jq -s '{daily: (.[0].daily + .[1].daily)}' nov.json dec.json | ccusageshare sync --stdin
```

## Troubleshooting Examples

### Verify Authentication

```bash
# Check if logged in
ccusageshare status

# Re-login if needed
ccusageshare logout
ccusageshare login
```

### Test with Dry Run

```bash
# Test sync without uploading
ccusageshare sync --dry-run

# Examine output for errors
ccusageshare sync --dry-run 2>&1 | tee sync-test.log
```

### Debug Piping Issues

```bash
# Verify ccusage output is valid JSON
ccusage daily --json | jq .

# Check for errors in the pipeline
ccusage daily --json 2>&1 | ccusageshare sync --stdin
```

### Manual JSON Sync

Create `test-data.json`:
```json
{
  "daily": [
    {
      "date": "2025-12-21",
      "inputTokens": 1000,
      "outputTokens": 500,
      "cacheCreationTokens": 0,
      "cacheReadTokens": 0,
      "totalTokens": 1500,
      "totalCost": 0.05,
      "modelsUsed": ["claude-3-5-sonnet-20241022"],
      "modelBreakdowns": []
    }
  ]
}
```

Sync it:
```bash
cat test-data.json | ccusageshare sync --stdin
```

## Scripting Patterns

### Sync with Notification

```bash
#!/bin/bash

OUTPUT=$(ccusageshare sync 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    # Extract entries processed
    ENTRIES=$(echo "$OUTPUT" | grep -oP 'Entries processed: \K\d+')
    echo "✓ Synced $ENTRIES entries successfully"

    # Send notification (macOS)
    osascript -e "display notification \"Synced $ENTRIES entries\" with title \"ccusageshare\""
else
    echo "✗ Sync failed: $OUTPUT"

    # Send error notification
    osascript -e "display notification \"Sync failed\" with title \"ccusageshare\" sound name \"Basso\""
    exit 1
fi
```

### Conditional Sync

```bash
#!/bin/bash

# Only sync if cost is above threshold
COST=$(ccusage daily --json | jq '.summary.totalCost')

if (( $(echo "$COST > 10" | bc -l) )); then
    echo "Cost is $COST, syncing..."
    ccusageshare sync
else
    echo "Cost is $COST, skipping sync"
fi
```

### Backup Before Sync

```bash
#!/bin/bash

# Create backup directory
BACKUP_DIR=~/ccusage-backups
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/ccusage_$TIMESTAMP.json"

# Backup current data
ccusage daily --json > "$BACKUP_FILE"

# Sync to leaderboard
cat "$BACKUP_FILE" | ccusageshare sync --stdin

# Keep only last 30 backups
ls -t "$BACKUP_DIR"/ccusage_*.json | tail -n +31 | xargs rm -f
```

## Team Usage

### Shared Stats Dashboard

```bash
# Each team member syncs daily
# alice
ccusageshare sync

# bob
ccusageshare sync

# charlie
ccusageshare sync

# View team leaderboard at:
# https://leaderboard.ccusage.com/team/your-team
```

### Competition Sync Script

```bash
#!/bin/bash

# Team sync script for weekly competition
echo "🏆 Team Weekly Sync 🏆"

ccusageshare sync --period weekly

# Show leaderboard URL
CONFIG=$(cat ~/.ccusageshare/config.json)
USERNAME=$(echo "$CONFIG" | jq -r '.username')

echo ""
echo "Your stats: https://leaderboard.ccusage.com/user/$USERNAME"
echo "Team leaderboard: https://leaderboard.ccusage.com/team"
echo ""
echo "Good luck! 🚀"
```

## Custom Integrations

### Slack Notification After Sync

```bash
#!/bin/bash

# Sync and post to Slack
RESULT=$(ccusageshare sync 2>&1)

if [ $? -eq 0 ]; then
    ENTRIES=$(echo "$RESULT" | grep -oP 'Entries processed: \K\d+')

    curl -X POST "$SLACK_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\": \"✓ Synced $ENTRIES ccusage entries to leaderboard\"}"
fi
```

### Discord Bot Integration

```javascript
import { syncCommand } from 'ccusageshare';
import { Client } from 'discord.js';

const client = new Client();

client.on('message', async (message) => {
  if (message.content === '!sync') {
    try {
      await message.reply('Syncing ccusage stats...');
      await syncCommand({ stdin: false, period: 'daily' });
      await message.reply('✓ Stats synced successfully!');
    } catch (error) {
      await message.reply(`✗ Sync failed: ${error.message}`);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
```

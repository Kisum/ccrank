# ccusageshare Quick Start Guide

## Installation

```bash
npm install -g ccusageshare
```

## 3-Step Setup

### 1. Get Your API Key

Join the Slack workspace and DM the bot:
```
/apikey
```

Copy the API key it returns.

### 2. Login

```bash
ccusageshare login
```

Enter your username and paste the API key.

### 3. Sync

```bash
ccusageshare sync
```

That's it! Your stats are now on the leaderboard.

## Common Commands

```bash
# Check if you're logged in
ccusageshare status

# Sync daily stats
ccusageshare sync

# Sync weekly stats
ccusageshare sync --period weekly

# Pipe from ccusage
ccusage daily --json | ccusageshare sync --stdin

# Preview without uploading
ccusageshare sync --dry-run

# Logout
ccusageshare logout
```

## Automation

### Daily Cron Job

```bash
# Open crontab
crontab -e

# Add this line (runs daily at 11 PM)
0 23 * * * ccusageshare sync >> ~/logs/ccusageshare.log 2>&1
```

### Shell Script

```bash
#!/bin/bash
# sync-daily.sh

ccusageshare sync
if [ $? -eq 0 ]; then
    echo "✓ Sync successful"
else
    echo "✗ Sync failed"
fi
```

## Troubleshooting

### "Not authenticated"
```bash
ccusageshare login
```

### "ccusage command not found"
```bash
npm install -g ccusage
```

### Network errors
Check your internet connection and try again.

### Invalid data format
Ensure you're piping JSON from ccusage with `--json` flag.

## Configuration

Config file location:
```
~/.ccusageshare/config.json
```

Format:
```json
{
  "apiKey": "ccusage_live_...",
  "username": "your-username",
  "apiEndpoint": "https://api.ccusageleaderboard.com/v1/sync"
}
```

## Getting Help

View all commands:
```bash
ccusageshare --help
```

View command-specific help:
```bash
ccusageshare sync --help
```

## Security Notes

- API keys are stored locally in `~/.ccusageshare/config.json`
- File permissions are set to 0600 (only you can read)
- Never share your API key
- Regenerate your key if it's compromised

## What Gets Synced?

For each day, ccusageshare uploads:
- Date
- Total tokens used
- Total cost
- Token breakdown (input, output, cache)
- Models used
- Your username

## Privacy

- Only data you explicitly sync is uploaded
- No automatic background syncing
- You control when and what to sync
- You can delete your data anytime

## Next Steps

- View the leaderboard: `https://leaderboard.ccusage.com`
- Set up daily automation
- Join the community on Slack
- Check out advanced examples in EXAMPLES.md

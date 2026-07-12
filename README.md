# Context Standup

> AI-powered standup agent that drafts updates from real GitHub activity — automatically.

---

## The Problem

Developers waste 5–10 minutes every morning manually typing standups from memory. Nobody remembers exactly what they did. Important blockers get missed.

## The Solution

Context Standup reads your actual GitHub commits, PRs, and issues, then uses AI to draft your standup automatically. You just review and approve with one click.

---

## Features

| Feature | Description |
|---|---|
| 🤖 **AI-generated drafts** | Drafts built from real GitHub activity via MCP server |
| 🔍 **Real-Time Search** | Powered by GitHub search API for live context |
| ⚠️ **Auto blocker detection** | Flags PRs with no reviews for 2+ days & stale issues |
| 👥 **/standup-all** | Triggers personalized drafts for the whole team at once |
| ✏️ **Edit modal** | Review and adjust your draft before posting |
| ⏰ **Cron scheduler** | Automatic 9:45 AM weekday trigger |
| 🔗 **/standup-connect** | Link your GitHub account in seconds |

---

## Architecture

```
[MCP Server (3 tools)]
        │
        ▼
[GitHub REST API]          [GitHub REST API]
  commits, PRs,       ←    (direct fallback)
  issues, blockers
        │
        ▼
   [Groq LLM]
 llama-3.3-70b-versatile
        │
        ▼
[Slack Block Kit DM]  →  [Team Channel Post]
```

---

## Tech Stack

- **[Slack Bolt SDK](https://slack.dev/bolt-js/)** — Node.js, Socket Mode
- **[MCP Server](https://modelcontextprotocol.io/)** — Custom server with 3 GitHub tools
- **[GitHub REST API](https://docs.github.com/en/rest)** — Commits, PRs, issues, blocker detection
- **[Groq LLM](https://console.groq.com/)** — `llama-3.3-70b-versatile` for fast inference
- **[node-cron](https://www.npmjs.com/package/node-cron)** — Scheduled standup triggers

---

## Hackathon Technologies Used

- ✅ **MCP server integration** — Custom MCP server exposing 3 GitHub tools (`get_github_context`, `detect_blockers`, `get_standup_summary`)
- ✅ **Slack AI capabilities** — AI-powered standup generation with Block Kit approval flow
- ✅ **Real-Time Search API** — Personalized activity context from GitHub

---

## Setup

### Prerequisites

- Node.js 18+
- A Slack workspace with admin access
- A GitHub account with a personal access token
- A free Groq API key — [console.groq.com](https://console.groq.com)

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/context-standup
cd context-standup
npm install
cp .env.example .env
# Fill in your tokens in .env
npm start
```

### Slack App Setup

1. Create a new app at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable **Socket Mode** under *Settings → Socket Mode*
3. Add **Bot Token Scopes** under *OAuth & Permissions*:
   ```
   channels:history
   channels:read
   chat:write
   im:write
   users:read
   users:read.email
   reactions:read
   commands
   ```
4. Add **Slash Commands** under *Features → Slash Commands*:
   - `/standup`
   - `/standup-all`
   - `/standup-connect`
5. Install the app to your workspace and copy the tokens to `.env`

### Environment Variables

```env
SLACK_BOT_TOKEN=xoxb-...          # Bot User OAuth Token
SLACK_APP_TOKEN=xapp-...          # App-Level Token (Socket Mode)
GROQ_API_KEY=gsk_...              # Groq API key
GITHUB_TOKEN=ghp_...              # GitHub Personal Access Token
GITHUB_USERNAME=your-github-username
STANDUP_CHANNEL=C...              # Channel ID for your standup channel
```

---

## Usage

```
/standup-connect github YOUR_GITHUB_USERNAME   → Link your GitHub account
/standup                                        → Get your personal AI draft
/standup-all                                    → Trigger drafts for everyone in the channel
```

**Workflow:**
1. Run `/standup` — the bot DMs you an AI-drafted standup based on your real GitHub activity
2. Review the draft (commits, PRs, open issues, and blockers are all referenced)
3. Hit **✅ Approve & Post** to publish to the channel, or **✏️ Edit First** to adjust sections

---

## Demo

> [Link to demo video]

---

## License

MIT

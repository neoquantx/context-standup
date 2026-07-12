require('dotenv').config();

const { App, LogLevel } = require('@slack/bolt');
const cron = require('node-cron');
const { generateRealDraft } = require('./src/draft');
const { getGithubUsername, getStoredIdentity, saveIdentity } = require('./src/connect');
const { listAvailableTools, closeMCPClient } = require('./src/mcp_client');

// Requires search:read scope in OAuth & Permissions
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  // logLevel: LogLevel.DEBUG, // Optional: uncomment if debugging is needed
});


function extractSection(text, section) {
  let header = "";
  if (section === "Yesterday") header = "✅ Yesterday";
  else if (section === "Today") header = "🔧 Today";
  else if (section === "Blockers") header = "⚠️ Blockers";

  if (!header) return "";

  const startIndex = text.indexOf(header);
  if (startIndex === -1) return "";

  const contentStart = startIndex + header.length;
  const remaining = text.substring(contentStart);

  // Search for the next section header emoji (✅, 🔧, or ⚠️)
  const nextSectionMatch = remaining.search(/\n(✅|🔧|⚠️)/);
  if (nextSectionMatch !== -1) {
    return remaining.substring(0, nextSectionMatch).trim();
  }

  return remaining.trim();
}

app.command("/standup", async ({ command, ack, client }) => {
  await ack();
  
  try {
    const githubUsername = getGithubUsername(command.user_id, null);
    const { draftText, blockers, hasRealData, openIssuesCount, usedMCP } = await generateRealDraft(command.user_id, githubUsername);
    const valueJson = JSON.stringify({ draft: draftText, channel: command.channel_id });

    let notice;
    if (usedMCP) {
      notice = "✨ _Draft generated via MCP Server from real GitHub activity_ • " + openIssuesCount + " open issue(s) found";
    } else if (hasRealData) {
      notice = "✨ _Draft generated from your real GitHub activity_ • " + openIssuesCount + " open issue(s) found";
    } else {
      notice = "⚠️ _No GitHub data found. Run `/standup-connect` to link your account._";
    }

    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "📋 Your Standup Draft", emoji: true }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: notice }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: draftText }
      }
    ];

    if (blockers && blockers.length > 0) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "*🚨 Auto-detected blockers:*\n" + blockers.map(b => "• " + b).join("\n") }
      });
    }

    blocks.push(
      {
        type: "divider"
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Approve & Post", emoji: true },
            style: "primary",
            action_id: "approve_standup",
            value: valueJson
          },
          {
            type: "button",
            text: { type: "plain_text", text: "✏️ Edit First", emoji: true },
            action_id: "edit_standup",
            value: valueJson
          }
        ]
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Powered by MCP Server + GitHub Real-Time Search • Context Standup"
          }
        ]
      }
    );

    await client.chat.postMessage({
      channel: command.user_id,
      text: "Your standup draft is ready!",
      blocks: blocks
    });
  } catch (error) {
    console.error("Error in /standup command:", error);
  }
});

app.action("approve_standup", async ({ ack, body, client }) => {
  await ack();
  
  try {
    const { draft, channel } = JSON.parse(body.actions[0].value);
    
    await client.chat.postMessage({
      channel: channel,
      text: "Standup Update",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "📢 Standup Update" }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: draft
            }
          ]
        },
        {
          type: "divider"
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "✍️ Posted by <@" + body.user.id + "> • " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            }
          ]
        }
      ]
    });

    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: "Standup posted!",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: "✅ Your standup has been posted to the channel!" } }
      ]
    });
  } catch (error) {
    console.error("Error in approve_standup action:", error);
  }
});

app.action("edit_standup", async ({ ack, body, client }) => {
  await ack();
  
  try {
    const { draft, channel } = JSON.parse(body.actions[0].value);
    
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "standup_modal_submit",
        private_metadata: channel,
        title: { type: "plain_text", text: "Edit Your Standup", emoji: true },
        submit: { type: "plain_text", text: "Post Standup", emoji: true },
        close: { type: "plain_text", text: "Cancel", emoji: true },
        blocks: [
          {
            type: "input",
            block_id: "yesterday",
            label: { type: "plain_text", text: "✅ Yesterday", emoji: true },
            element: {
              type: "plain_text_input",
              action_id: "yesterday_input",
              multiline: true,
              initial_value: extractSection(draft, "Yesterday")
            }
          },
          {
            type: "input",
            block_id: "today",
            label: { type: "plain_text", text: "🔧 Today", emoji: true },
            element: {
              type: "plain_text_input",
              action_id: "today_input",
              multiline: true,
              initial_value: extractSection(draft, "Today")
            }
          },
          {
            type: "input",
            block_id: "blockers",
            label: { type: "plain_text", text: "⚠️ Blockers", emoji: true },
            element: {
              type: "plain_text_input",
              action_id: "blockers_input",
              multiline: true,
              initial_value: extractSection(draft, "Blockers")
            }
          }
        ]
      }
    });
  } catch (error) {
    console.error("Error in edit_standup action:", error);
  }
});

app.view("standup_modal_submit", async ({ ack, body, view, client }) => {
  await ack();
  
  try {
    const channel = view.private_metadata;
    const yesterday = view.state.values.yesterday.yesterday_input.value;
    const today = view.state.values.today.today_input.value;
    const blockers = view.state.values.blockers.blockers_input.value;
    
    const finalText = "✅ Yesterday\n" + yesterday + "\n\n🔧 Today\n" + today + "\n\n⚠️ Blockers\n" + blockers;
    
    await client.chat.postMessage({
      channel: channel,
      text: "Standup Update",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "📢 Standup Update" }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: finalText
            }
          ]
        },
        {
          type: "divider"
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "✍️ Posted by <@" + body.user.id + "> • " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            }
          ]
        }
      ]
    });
  } catch (error) {
    console.error("Error in standup_modal_submit view:", error);
  }
});

async function triggerStandupForAll(channelId) {
  try {
    const membersResponse = await app.client.conversations.members({
      channel: channelId
    });
    
    for (const userId of membersResponse.members) {
      const userInfo = await app.client.users.info({ user: userId });
      
      if (userInfo.user.is_bot || userInfo.user.deleted) {
        continue;
      }
      
      const githubUsername = getGithubUsername(userId, null);
      const { draftText, blockers, hasRealData } = await generateRealDraft(userId, githubUsername);
      const valueJson = JSON.stringify({ draft: draftText, channel: channelId });
      
      let notice = "⚠️ _No GitHub data found. Run `/standup-connect` to link your account._";
      if (hasRealData) {
        notice = "✨ _Draft generated from your real GitHub activity_";
      }

      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: "⏰ Standup Time!" }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Good morning! Here's your AI-drafted standup:*"
          }
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: notice }
        },
        { type: "divider" },
        {
          type: "section",
          text: { type: "mrkdwn", text: draftText }
        }
      ];

      if (blockers && blockers.length > 0) {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: "*🚨 Auto-detected blockers:*\n" + blockers.map(b => "• " + b).join("\n") }
        });
      }

      blocks.push(
        { type: "divider" },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "✅ Approve & Post" },
              style: "primary",
              action_id: "approve_standup",
              value: valueJson
            },
            {
              type: "button",
              text: { type: "plain_text", text: "✏️ Edit First" },
              action_id: "edit_standup",
              value: valueJson
            }
          ]
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "🤖 Draft generated by Context Standup AI • React to approve without opening"
            }
          ]
        }
      );

      await app.client.chat.postMessage({
        channel: userId,
        text: "Time for your standup!",
        blocks: blocks
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    await app.client.chat.postMessage({
      channel: channelId,
      text: "Standup time!",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "📢 Standup Time!" }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "🤖 *Context Standup* has sent everyone their personalized AI-drafted standup based on their recent Slack activity.\nCheck your DMs, review your draft, and post when ready!"
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Use `/standup` anytime to generate a new draft"
            }
          ]
        }
      ]
    });
  } catch (error) {
    console.error("Error in triggerStandupForAll:", error);
  }
}

app.command("/standup-all", async ({ command, ack, client }) => {
  await ack();
  
  await client.chat.postEphemeral({
    channel: command.channel_id,
    user: command.user_id,
    text: "🚀 Triggering standup drafts for everyone in this channel..."
  });
  
  await triggerStandupForAll(command.channel_id);
});

app.command('/standup-connect', async ({ command, ack, client }) => {
  await ack();
  
  const args = command.text.trim().split(/\s+/);
  
  if (args.length === 0 || args[0] === 'help' || args[0] === '') {
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: "How to connect your accounts",
      blocks: [
        { type: "header", text: { type: "plain_text", text: "🔗 Connect Your Accounts" } },
        { type: "section", text: { type: "mrkdwn", text: "*Usage:*\n`/standup-connect github YOUR_GITHUB_USERNAME`\n\nExample:\n`/standup-connect github himanshu-nikam`" } },
        { type: "section", text: { type: "mrkdwn", text: "*Why connect?*\nOnce connected, your standup drafts will be based on your *real* GitHub commits, open PRs, and code reviews — not generic AI content." } }
      ]
    });
    return;
  }
  
  if (args[0] === 'github' && args[1]) {
    const githubUsername = args[1];
    saveIdentity(command.user_id, githubUsername, null);
    
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: "Connected!",
      blocks: [
        { type: "header", text: { type: "plain_text", text: "✅ GitHub Connected!" } },
        { type: "section", text: { type: "mrkdwn", text: "Your GitHub username *" + githubUsername + "* has been linked to your Slack account.\n\nNext time you run `/standup`, your draft will be based on your real commits and PRs!" } },
        { type: "section", text: { type: "mrkdwn", text: "*Testing your connection:*\nRun `/standup` now to see your personalized draft." } }
      ]
    });
    return;
  }
  
  await client.chat.postEphemeral({
    channel: command.channel_id,
    user: command.user_id,
    text: "Invalid command. Run `/standup-connect help` for instructions."
  });
});

cron.schedule("45 9 * * 1-5", () => {
  if (process.env.STANDUP_CHANNEL) {
    console.log("Triggering scheduled standup for channel: " + process.env.STANDUP_CHANNEL);
    triggerStandupForAll(process.env.STANDUP_CHANNEL);
  } else {
    console.log("STANDUP_CHANNEL not set in .env");
  }
});

app.event('app_home_opened', async ({ event, client }) => {
  try {
    await client.views.publish({
      user_id: event.user,
      view: {
        type: 'home',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '📋 Context Standup' }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*AI-powered standups from your real GitHub activity.*\nNo more typing from memory. Connect your GitHub account and let the agent do the work.'
            }
          },
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*🚀 Quick Start*\n1. Run `/standup-connect github YOUR_USERNAME` to link GitHub\n2. Run `/standup` to get your AI draft\n3. Approve or edit, then post to the channel'
            }
          },
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*⚡ Commands*\n`/standup` — Generate your personal standup draft\n`/standup-all` — Send drafts to everyone in the channel\n`/standup-connect github USERNAME` — Link your GitHub account'
            }
          },
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*🔧 Powered by*\n• MCP Server with 3 GitHub tools\n• Real-Time Search API\n• Groq LLM (llama-3.3-70b)\n• Auto blocker detection'
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Built for the Slack Agent Builder Challenge 2026 • Context Standup'
              }
            ]
          }
        ]
      }
    });
  } catch (error) {
    console.error('App home error:', error);
  }
});

async function start() {
  try {
    await app.start();
    console.log("⚡️ Context Standup is running in Socket Mode!");
    try {
      const tools = await listAvailableTools();
      console.log("MCP Server connected! Available tools:");
      tools.tools.forEach(t => console.log("  -", t.name, ":", t.description));
    } catch (err) {
      console.log("MCP Server not available, using direct API fallback");
    }
  } catch (error) {
    console.error("Failed to start the app:", error);
  }
}

start();

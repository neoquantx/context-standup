require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { getGithubContext } = require('./github');
const { detectBlockers } = require('./blockers');

const server = new Server(
    {
        name: "context-standup-github-server",
        version: "1.0.0"
    },
    {
        capabilities: { tools: {} }
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "get_github_context",
                description: "Fetches real GitHub commits, pull requests, and issues for a developer. Returns their actual coding activity from the last 24-48 hours.",
                inputSchema: {
                    type: "object",
                    properties: {
                        githubUsername: {
                            type: "string",
                            description: "The GitHub username to fetch activity for"
                        }
                    },
                    required: ["githubUsername"]
                }
            },
            {
                name: "detect_blockers",
                description: "Analyzes GitHub activity to automatically detect blockers. Flags PRs waiting for review more than 2 days and issues open more than 7 days.",
                inputSchema: {
                    type: "object",
                    properties: {
                        githubUsername: {
                            type: "string",
                            description: "The GitHub username to detect blockers for"
                        }
                    },
                    required: ["githubUsername"]
                }
            },
            {
                name: "get_standup_summary",
                description: "Gets a complete standup data summary for a developer combining commits, PRs, issues, and blockers in one call.",
                inputSchema: {
                    type: "object",
                    properties: {
                        githubUsername: {
                            type: "string",
                            description: "The GitHub username"
                        }
                    },
                    required: ["githubUsername"]
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "get_github_context") {
            const context = await getGithubContext(args.githubUsername);
            return {
                content: [{ type: "text", text: JSON.stringify(context, null, 2) }]
            };
        }

        if (name === "detect_blockers") {
            const context = await getGithubContext(args.githubUsername);
            const blockers = detectBlockers(context, null, []);
            return {
                content: [{ type: "text", text: JSON.stringify({ blockers, count: blockers.length }, null, 2) }]
            };
        }

        if (name === "get_standup_summary") {
            const context = await getGithubContext(args.githubUsername);
            const blockers = detectBlockers(context, null, []);
            const summary = {
                username: args.githubUsername,
                fetchedAt: new Date().toISOString(),
                commits: context.commits,
                openPRs: context.prs,
                prsWaitingReview: context.prsWaitingReview,
                reviewsGiven: context.reviewsGiven,
                openIssues: context.openIssues,
                closedIssuesRecently: context.closedIssuesRecently,
                blockers: blockers,
                stats: {
                    totalCommits: context.commits.length,
                    totalOpenPRs: context.prs.length,
                    totalOpenIssues: context.openIssues.length,
                    totalBlockers: blockers.length
                }
            };
            return {
                content: [{ type: "text", text: JSON.stringify(summary, null, 2) }]
            };
        }

        throw new Error("Unknown tool: " + name);

    } catch (error) {
        return {
            content: [{ type: "text", text: JSON.stringify({ error: error.message }) }],
            isError: true
        };
    }
});

async function main() {
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Context Standup MCP Server running on stdio");
    } catch (error) {
        console.error("Failed to start MCP server:", error);
        process.exit(1);
    }
}

main();

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

let mcpClient = null;

async function connectMCPClient() {
    if (mcpClient) return mcpClient;

    try {
        const transport = new StdioClientTransport({
            command: "node",
            args: [path.join(__dirname, 'mcp_server.js')],
            env: { ...process.env }
        });

        mcpClient = new Client(
            {
                name: "context-standup-slack-agent",
                version: "1.0.0"
            },
            {
                capabilities: {}
            }
        );

        await mcpClient.connect(transport);
        console.log("Connected to Context Standup MCP Server");
        return mcpClient;
    } catch (error) {
        console.error("Failed to connect MCP client:", error);
        mcpClient = null;
        throw error;
    }
}

async function callTool(toolName, args) {
    try {
        const client = await connectMCPClient();
        const result = await client.callTool({ name: toolName, arguments: args });
        return JSON.parse(result.content[0].text);
    } catch (error) {
        console.error("MCP tool call failed: " + error.message);
        throw error;
    }
}

async function listAvailableTools() {
    try {
        const client = await connectMCPClient();
        const result = await client.listTools();
        return result;
    } catch (error) {
        console.error("Failed to list MCP tools:", error);
        throw error;
    }
}

async function getGithubContextViaMCP(githubUsername) {
    return callTool("get_github_context", { githubUsername });
}

async function detectBlockersViaMCP(githubUsername) {
    const result = await callTool("detect_blockers", { githubUsername });
    return result.blockers;
}

async function getStandupSummaryViaMCP(githubUsername) {
    return callTool("get_standup_summary", { githubUsername });
}

async function closeMCPClient() {
    if (mcpClient) {
        await mcpClient.close();
        mcpClient = null;
    }
}

module.exports = {
    connectMCPClient,
    callTool,
    listAvailableTools,
    getGithubContextViaMCP,
    detectBlockersViaMCP,
    getStandupSummaryViaMCP,
    closeMCPClient
};

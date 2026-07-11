const { getGithubContext } = require('./github');
const { detectBlockers } = require('./blockers');
const Groq = require('groq-sdk');
const { getStandupSummaryViaMCP } = require('./mcp_client');

async function generateRealDraft(userId, githubUsername) {
    const fallbackText = "✅ Yesterday\n• Completed assigned tasks\n\n🔧 Today\n• Continue current work\n\n⚠️ Blockers\n• None";
    
    try {
        let commits, prs, prsWaitingReview, reviewsGiven, openIssues, closedIssuesRecently, blockers;
        let usedMCP = false;

        // Step 1: Try MCP first
        try {
            const result = await getStandupSummaryViaMCP(githubUsername);
            commits = result.commits;
            prs = result.openPRs;
            prsWaitingReview = result.prsWaitingReview;
            reviewsGiven = result.reviewsGiven;
            openIssues = result.openIssues;
            closedIssuesRecently = result.closedIssuesRecently;
            blockers = result.blockers;
            console.log("Using MCP for GitHub data - tools working");
            usedMCP = true;
        } catch (mcpError) {
            console.log("MCP unavailable, falling back to direct API");
            const githubContext = await getGithubContext(githubUsername);
            commits = githubContext.commits;
            prs = githubContext.prs;
            prsWaitingReview = githubContext.prsWaitingReview;
            reviewsGiven = githubContext.reviewsGiven;
            openIssues = githubContext.openIssues || [];
            closedIssuesRecently = githubContext.closedIssuesRecently || [];
            blockers = detectBlockers(githubContext, null, []);
            usedMCP = false;
        }
        
        let contextParts = [];
        
        if (commits && commits.length > 0) {
            contextParts.push("Recent commits:\n" + commits.slice(0, 3).map(c => `- [${c.repo}] ${c.message}`).join("\n"));
        }
        
        if (closedIssuesRecently && closedIssuesRecently.length > 0) {
            contextParts.push("Issues completed recently:\n" + closedIssuesRecently.slice(0, 3).map(i => `- Issue #${i.number}: ${i.title} in ${i.repo}`).join("\n"));
        }
        
        if (openIssues && openIssues.length > 0) {
            contextParts.push("Open issues assigned to me:\n" + openIssues.slice(0, 5).map(i => `- Issue #${i.number}: ${i.title} (${i.daysOpen} days open)${i.labels !== "none" ? " [" + i.labels + "]" : ""}`).join("\n"));
        }

        if (prs && prs.length > 0) {
            contextParts.push("Open PRs:\n" + prs.slice(0, 3).map(p => `- PR #${p.number}: ${p.title} (${p.daysOpen} days old)`).join("\n"));
        }
        
        if (reviewsGiven && reviewsGiven.length > 0) {
            contextParts.push("Reviews given:\n" + reviewsGiven.slice(0, 2).map(r => `- Reviewed: ${r.prTitle}`).join("\n"));
        }
        
        if (blockers && blockers.length > 0) {
            contextParts.push("Potential blockers:\n" + blockers.map(b => "- " + b).join("\n"));
        }
        
        const contextString = contextParts.join("\n\n");
        const hasRealData = contextParts.length > 0;
        
        if (hasRealData) {
            const groq = new Groq();
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are a standup writing assistant for software developers. \nGenerate a SPECIFIC and ACCURATE daily standup based on the REAL \nactivity data provided. Reference actual PR numbers, issue numbers, \ncommit messages from the data. Do NOT make up tasks.\nOutput ONLY in this exact format with no extra text:\n✅ Yesterday\n• [specific accomplishment - reference real commits or closed issues]\n🔧 Today\n• [specific plan - reference open issues and PRs from the data]\n⚠️ Blockers\n• [specific blocker from data, or None]\nMax 3 bullets per section. \nIf a section has no data, write ONLY ONE bullet: Nothing to report.\nNever repeat Nothing to report more than once per section.\nEach bullet that HAS data must reference real issue numbers, \nPR numbers, or commit messages."
                    },
                    {
                        role: "user",
                        content: `Generate my standup based on this real activity data:\n\n${contextString}\n\nIf no data is available for a section, write 'Nothing to report'.`
                    }
                ],
                model: "llama-3.3-70b-versatile",
                max_tokens: 400
            });
            
            return {
                draftText: completion.choices[0].message.content,
                blockers,
                hasRealData,
                openIssuesCount: openIssues ? openIssues.length : 0,
                usedMCP
            };
        } else {
            return {
                draftText: fallbackText,
                blockers: [],
                hasRealData: false,
                openIssuesCount: 0,
                usedMCP: false
            };
        }
    } catch (error) {
        console.error("Error generating real draft:", error);
        return { draftText: fallbackText, blockers: [], hasRealData: false, openIssuesCount: 0, usedMCP: false };
    }
}

module.exports = {
    generateRealDraft
};

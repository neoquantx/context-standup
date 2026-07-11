function detectBlockers(githubContext, jiraContext, slackMessages) {
    const blockers = [];

    try {
        if (githubContext && githubContext.prsWaitingReview) {
            githubContext.prsWaitingReview.forEach(pr => {
                if (pr.daysOpen >= 2) {
                    blockers.push(`PR #${pr.number}: '${pr.title}' has no reviews for ${pr.daysOpen} days`);
                }
            });
        }

        if (githubContext && githubContext.openIssues) {
            let issueBlockerCount = 0;
            githubContext.openIssues.forEach(issue => {
                if (issue.daysOpen >= 7 && issueBlockerCount < 2) {
                    blockers.push(`Issue #${issue.number}: '${issue.title}' has been open for ${issue.daysOpen} days`);
                    issueBlockerCount++;
                }
            });
        }

        if (jiraContext) {
            if (jiraContext.inProgress) {
                jiraContext.inProgress.forEach(ticket => {
                    if (ticket.daysInStatus >= 5) {
                        blockers.push(`${ticket.key}: '${ticket.summary}' stuck in progress for ${ticket.daysInStatus} days`);
                    }
                });
            }
            if (jiraContext.blocked) {
                jiraContext.blocked.forEach(ticket => {
                    blockers.push(`${ticket.key}: '${ticket.summary}' is marked as blocked`);
                });
            }
        }

        if (slackMessages && Array.isArray(slackMessages)) {
            let slackBlockerCount = 0;
            slackMessages.forEach(message => {
                if (message.endsWith("?") && message.length > 20 && slackBlockerCount < 2) {
                    blockers.push(`Unanswered question: '${message.slice(0, 60)}...'`);
                    slackBlockerCount++;
                }
            });
        }
    } catch (error) {
        console.error("Error detecting blockers:", error);
    }

    return blockers.slice(0, 5);
}

module.exports = {
    detectBlockers
};

const process = require('process');

function createIsoDate(hoursAgo) {
    return new Date(Date.now() - hoursAgo * 3600000).toISOString().split('T')[0];
}

async function githubFetch(url) {
    const headers = {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function getUserCommits(githubUsername, hoursAgo = 24) {
    try {
        const isoDate = createIsoDate(hoursAgo);
        const query = encodeURIComponent(`author:${githubUsername} author-date:>=${isoDate}`);
        const url = `https://api.github.com/search/commits?q=${query}&per_page=5`;
        
        const data = await githubFetch(url);
        return (data.items || []).slice(0, 5).map(item => ({
            repo: item.repository.full_name,
            message: item.commit.message.split('\n')[0].substring(0, 80),
            sha: item.sha.slice(0, 7),
            url: item.html_url
        }));
    } catch (error) {
        console.error('Error fetching commits:', error);
        return [];
    }
}

async function getUserPRs(githubUsername, hoursAgo = 48) {
    try {
        const isoDate = createIsoDate(hoursAgo);
        const query = encodeURIComponent(`type:pr author:${githubUsername} updated:>=${isoDate} state:open`);
        const url = `https://api.github.com/search/issues?q=${query}&per_page=5`;
        
        const data = await githubFetch(url);
        return (data.items || []).slice(0, 5).map(item => ({
            title: item.title,
            number: item.number,
            repo: item.repository_url.replace("https://api.github.com/repos/", ""),
            url: item.html_url,
            daysOpen: Math.floor((Date.now() - new Date(item.created_at)) / 86400000),
            draft: item.draft || false
        }));
    } catch (error) {
        console.error('Error fetching PRs:', error);
        return [];
    }
}

async function getPRsWaitingReview(githubUsername, hoursAgo = 48) {
    try {
        const isoDate = createIsoDate(hoursAgo);
        const query = encodeURIComponent(`type:pr author:${githubUsername} review:none state:open`);
        const url = `https://api.github.com/search/issues?q=${query}&per_page=3`;
        
        const data = await githubFetch(url);
        return (data.items || []).slice(0, 3).map(item => ({
            title: item.title,
            number: item.number,
            repo: item.repository_url.replace("https://api.github.com/repos/", ""),
            url: item.html_url,
            daysOpen: Math.floor((Date.now() - new Date(item.created_at)) / 86400000),
            draft: item.draft || false
        }));
    } catch (error) {
        console.error('Error fetching PRs waiting review:', error);
        return [];
    }
}

async function getReviewsGiven(githubUsername, hoursAgo = 24) {
    try {
        const isoDate = createIsoDate(hoursAgo);
        const query = encodeURIComponent(`type:pr reviewed-by:${githubUsername} updated:>=${isoDate}`);
        const url = `https://api.github.com/search/issues?q=${query}&per_page=3`;
        
        const data = await githubFetch(url);
        return (data.items || []).slice(0, 3).map(item => ({
            prTitle: item.title,
            repo: item.repository_url.replace("https://api.github.com/repos/", ""),
            url: item.html_url
        }));
    } catch (error) {
        console.error('Error fetching reviews given:', error);
        return [];
    }
}

async function getUserIssues(githubUsername) {
    try {
        const query = encodeURIComponent(`author:${githubUsername} type:issue state:open`);
        const url = `https://api.github.com/search/issues?q=${query}&per_page=5`;
        
        const data = await githubFetch(url);
        return (data.items || []).slice(0, 5).map(item => ({
            number: item.number,
            title: item.title,
            repo: item.repository_url.replace("https://api.github.com/repos/", ""),
            url: item.html_url,
            daysOpen: Math.floor((Date.now() - new Date(item.created_at)) / 86400000),
            labels: item.labels && item.labels.length > 0 ? item.labels.map(l => l.name).join(", ") : "none"
        }));
    } catch (error) {
        console.error('Error fetching user issues:', error);
        return [];
    }
}

async function getClosedIssuesRecently(githubUsername) {
    try {
        const isoDate = createIsoDate(48);
        const query = encodeURIComponent(`author:${githubUsername} type:issue state:closed closed:>=${isoDate}`);
        const url = `https://api.github.com/search/issues?q=${query}&per_page=3`;
        
        const data = await githubFetch(url);
        return (data.items || []).slice(0, 3).map(item => ({
            number: item.number,
            title: item.title,
            repo: item.repository_url.replace("https://api.github.com/repos/", ""),
            url: item.html_url
        }));
    } catch (error) {
        console.error('Error fetching closed issues recently:', error);
        return [];
    }
}

async function getGithubContext(githubUsername) {
    const [commits, prs, prsWaitingReview, reviewsGiven, openIssues, closedIssuesRecently] = await Promise.all([
        getUserCommits(githubUsername),
        getUserPRs(githubUsername),
        getPRsWaitingReview(githubUsername),
        getReviewsGiven(githubUsername),
        getUserIssues(githubUsername),
        getClosedIssuesRecently(githubUsername)
    ]);
    
    return {
        commits,
        prs,
        prsWaitingReview,
        reviewsGiven,
        openIssues,
        closedIssuesRecently
    };
}

module.exports = {
    getUserCommits,
    getUserPRs,
    getPRsWaitingReview,
    getReviewsGiven,
    getUserIssues,
    getClosedIssuesRecently,
    getGithubContext,
    createIsoDate,
    githubFetch
};

const fs = require('fs');
const path = require('path');
const process = require('process');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'users.json');

function getStoredIdentity(userId) {
    try {
        if (!fs.existsSync(dataFile)) {
            return null;
        }
        const data = fs.readFileSync(dataFile, 'utf8');
        const users = JSON.parse(data);
        return users[userId] || null;
    } catch (error) {
        console.error(`Error reading identity for ${userId}:`, error);
        return null;
    }
}

function saveIdentity(userId, githubUsername, jiraEmail) {
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        let users = {};
        if (fs.existsSync(dataFile)) {
            const data = fs.readFileSync(dataFile, 'utf8');
            try {
                users = JSON.parse(data);
            } catch (e) {
                console.error("Failed to parse users.json, starting fresh", e);
                users = {};
            }
        }
        
        users[userId] = { githubUsername, jiraEmail };
        fs.writeFileSync(dataFile, JSON.stringify(users, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error saving identity for ${userId}:`, error);
        return false;
    }
}

function getGithubUsername(userId, slackEmail) {
    try {
        const identity = getStoredIdentity(userId);
        if (identity && identity.githubUsername) {
            return identity.githubUsername;
        }
        return process.env.GITHUB_USERNAME || null;
    } catch (error) {
        console.error(`Error getting GitHub username for ${userId}:`, error);
        return process.env.GITHUB_USERNAME || null;
    }
}

module.exports = {
    getStoredIdentity,
    saveIdentity,
    getGithubUsername
};

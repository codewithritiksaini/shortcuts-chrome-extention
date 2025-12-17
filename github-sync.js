// github-sync.js - GitHub API functions for shortcut sync

class GitHubSync {
  constructor(token, repoUrl, userEmail = null) {
    this.token = token;
    const { owner, repo } = this.parseRepoUrl(repoUrl);
    this.owner = owner;
    this.repo = repo;
    this.userEmail = userEmail;
    
    // 🔥 SIMPLE SOLUTION: Direct file from email
    // No directories, just email-based filename
    if (userEmail) {
      this.basePath = this.emailToFilename(userEmail);
    } else {
      this.basePath = 'shortcuts.json'; // Default fallback
    }
    
    this.headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Shortcuts-Extension'
    };
  }

  // Convert email to safe filename
  emailToFilename(email) {
    if (!email) return 'shortcuts.json';
    
    const safeEmail = email.toLowerCase().trim();
    
    // Create safe filename: user@domain.com -> user-at-domain-com.json
    let filename = safeEmail
      .replace('@', '-at-')
      .replace(/\./g, '-')
      .replace(/[^a-z0-9\-]/g, ''); // Remove special chars
    
    return `${filename}.json`;
  }

  // Get display name for UI
  getDisplayFilename() {
    if (!this.userEmail) return 'shortcuts.json';
    const username = this.userEmail.split('@')[0];
    return `${username}.json`;
  }

  parseRepoUrl(url) {
    if (!url) throw new Error('Repository URL is required');
    
    url = url.replace('.git', '').replace('https://', '');
    
    let match;
    if (url.includes('github.com')) {
      match = url.match(/github\.com[/:]([^/]+)\/([^/]+)/);
    } else {
      match = url.match(/([^/]+)\/([^/]+)/);
    }
    
    if (!match) {
      throw new Error('Invalid GitHub URL format. Expected: https://github.com/username/repo or username/repo');
    }
    
    return { owner: match[1], repo: match[2] };
  }

  // Test connection (SIMPLE - no directory creation)
  async testConnection() {
    try {
      const url = `https://api.github.com/repos/${this.owner}/${this.repo}`;
      const response = await fetch(url, { headers: this.headers });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Repository not found. Check the URL and make sure you have access.');
        } else if (response.status === 401) {
          throw new Error('Invalid access token. Please check your token and permissions.');
        } else if (response.status === 403) {
          throw new Error('Access forbidden. Check token permissions (need "repo" scope).');
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
      
      const repoInfo = await response.json();
      
      let message = `Connected to ${repoInfo.full_name}`;
      if (this.userEmail) {
        message += ` (${this.userEmail})`;
      }
      
      return { 
        success: true, 
        data: repoInfo,
        message: message
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        details: 'Make sure: 1) Repo exists 2) Token is valid 3) Token has "repo" permission'
      };
    }
  }

  // PUSH function - DIRECT to file
  async push(shortcuts, sha = null) {
    try {
      const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.basePath}`;
      
      const jsonString = JSON.stringify(shortcuts, null, 2);
      const contentBase64 = btoa(unescape(encodeURIComponent(jsonString)));
      
      const payload = {
        message: `Shortcuts update for ${this.userEmail || 'default'} - ${new Date().toLocaleString()}`,
        content: contentBase64,
        ...(sha && { sha: sha })
      };
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `GitHub error: ${response.status}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.message) errorMessage = errorJson.message;
        } catch (e) {}
        
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      return { 
        success: true, 
        sha: result.content.sha,
        filePath: this.basePath,
        userEmail: this.userEmail
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message
      };
    }
  }

  // PULL function - DIRECT from file
  async pull() {
    try {
      const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.basePath}`;
      const response = await fetch(url, { 
        headers: this.headers 
      });
      
      if (response.status === 404) {
        return { 
          success: true, 
          data: {}, 
          sha: null, 
          exists: false 
        };
      }
      
      if (!response.ok) {
        throw new Error(`GitHub error: ${response.status}`);
      }
      
      const result = await response.json();
      
      const jsonString = decodeURIComponent(escape(atob(result.content)));
      const shortcuts = JSON.parse(jsonString);
      
      return { 
        success: true, 
        data: shortcuts, 
        sha: result.sha,
        exists: true,
        filePath: this.basePath
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message
      };
    }
  }

  // Sync function - SIMPLE (no directory logic)
  async sync(localShortcuts) {
    try {
      const pullResult = await this.pull();
      if (!pullResult.success) {
        throw new Error(`Failed to pull from GitHub: ${pullResult.error}`);
      }
      
      let remoteShortcuts = pullResult.data;
      let sha = pullResult.sha;
      
      // If file doesn't exist on GitHub, create it
      if (!pullResult.exists) {
        const pushResult = await this.push(localShortcuts);
        if (!pushResult.success) {
          throw new Error(`Initial push failed: ${pushResult.error}`);
        }
        return { 
          success: true, 
          action: 'created',
          data: localShortcuts,
          message: `Created shortcuts file for ${this.userEmail || 'default'}`,
          filePath: this.basePath
        };
      }
      
      // Check if there are any changes
      const hasLocalChanges = this.hasChanges(remoteShortcuts, localShortcuts);
      
      if (!hasLocalChanges) {
        return { 
          success: true, 
          action: 'no_changes',
          data: remoteShortcuts,
          message: 'No changes detected',
          filePath: this.basePath
        };
      }
      
      // Merge local and remote data
      const merged = this.mergeShortcuts(remoteShortcuts, localShortcuts);
      
      // Check if merge resulted in actual changes
      const mergedChanged = this.hasChanges(remoteShortcuts, merged);
      
      if (!mergedChanged) {
        return { 
          success: true, 
          action: 'no_changes',
          data: remoteShortcuts,
          message: 'No new changes to sync',
          filePath: this.basePath
        };
      }
      
      // Push merged data back
      const pushResult = await this.push(merged, sha);
      if (!pushResult.success) {
        throw new Error(`Push failed: ${pushResult.error}`);
      }
      
      return { 
        success: true, 
        action: 'synced',
        data: merged,
        message: `Synced ${Object.keys(merged).length} shortcuts for ${this.userEmail || 'default'}`,
        filePath: this.basePath
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        action: 'failed'
      };
    }
  }

  // Check if two shortcut sets are different
  hasChanges(oldShortcuts, newShortcuts) {
    const oldKeys = Object.keys(oldShortcuts);
    const newKeys = Object.keys(newShortcuts);
    
    if (oldKeys.length !== newKeys.length) return true;
    
    for (const key of oldKeys) {
      if (!newShortcuts[key]) return true;
      
      if (oldShortcuts[key].text !== newShortcuts[key].text) return true;
      
      const oldEmojis = oldShortcuts[key].emojis || '';
      const newEmojis = newShortcuts[key].emojis || '';
      if (oldEmojis !== newEmojis) return true;
    }
    
    for (const key of newKeys) {
      if (!oldShortcuts[key]) return true;
    }
    
    return false;
  }

  // Simple merge: local data overrides remote
  mergeShortcuts(remote, local) {
    const merged = { ...remote };
    Object.keys(local).forEach(key => {
      merged[key] = local[key];
    });
    return merged;
  }

  // Get sync status
  getStatus() {
    return {
      owner: this.owner,
      repo: this.repo,
      userEmail: this.userEmail,
      fileName: this.basePath,
      displayName: this.getDisplayFilename(),
      connected: !!this.token,
      apiUrl: `https://api.github.com/repos/${this.owner}/${this.repo}`,
      fileUrl: `https://github.com/${this.owner}/${this.repo}/blob/main/${this.basePath}`
    };
  }

  // Get file info
  async getFileInfo() {
    try {
      const result = await this.pull();
      if (!result.success) return result;
      
      return {
        success: true,
        exists: result.exists,
        fileName: this.basePath,
        userEmail: this.userEmail,
        size: result.exists ? JSON.stringify(result.data).length : 0,
        shortcutCount: result.exists ? Object.keys(result.data).length : 0,
        lastModified: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete specific shortcut
  async deleteShortcut(key) {
    try {
      const pullResult = await this.pull();
      if (!pullResult.success) {
        throw new Error(`Failed to get data: ${pullResult.error}`);
      }
      
      if (!pullResult.exists) {
        return { success: true, message: 'File does not exist on GitHub' };
      }
      
      const shortcuts = pullResult.data;
      const sha = pullResult.sha;
      
      if (!shortcuts[key]) {
        return { success: true, message: 'Shortcut not found on GitHub' };
      }
      
      delete shortcuts[key];
      
      const pushResult = await this.push(shortcuts, sha);
      if (!pushResult.success) {
        throw new Error(`Failed to push: ${pushResult.error}`);
      }
      
      return {
        success: true,
        message: `Deleted "${key}" from ${this.userEmail || 'default'} shortcuts`,
        deletedCount: 1,
        filePath: this.basePath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get all user files (list all email-based files)
  async listAllUserFiles() {
    try {
      const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents`;
      const response = await fetch(url, {
        headers: this.headers
      });
      
      if (!response.ok) {
        throw new Error(`GitHub error: ${response.status}`);
      }
      
      const contents = await response.json();
      
      // Filter JSON files that look like email hashes
      const userFiles = contents
        .filter(item => item.type === 'file' && item.name.endsWith('.json'))
        .filter(file => file.name.includes('-at-')) // Email pattern
        .map(file => {
          // Convert filename back to email
          let email = file.name.replace('.json', '');
          email = email.replace('-at-', '@');
          email = email.replace(/-/g, '.');
          return {
            filename: file.name,
            email: email,
            path: file.path,
            size: file.size
          };
        });
      
      return {
        success: true,
        files: userFiles
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GitHubSync;
}
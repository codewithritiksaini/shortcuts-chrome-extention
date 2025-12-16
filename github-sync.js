// github-sync.js - GitHub API functions for shortcut sync

class GitHubSync {
  constructor(token, repoUrl) {
    this.token = token;
    const { owner, repo } = this.parseRepoUrl(repoUrl);
    this.owner = owner;
    this.repo = repo;
    this.basePath = 'shortcuts.json';
    this.headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Shortcuts-Extension'
    };
  }

  // Parse GitHub URL to get owner and repo name
  parseRepoUrl(url) {
    if (!url) {
      throw new Error('Repository URL is required');
    }
    
    // Remove .git if present
    url = url.replace('.git', '');
    
    // Remove https:// if present
    url = url.replace('https://', '');
    
    // Handle different URL formats
    let match;
    if (url.includes('github.com')) {
      match = url.match(/github\.com[/:]([^/]+)\/([^/]+)/);
    } else {
      // Assume it's already in format username/repo
      match = url.match(/([^/]+)\/([^/]+)/);
    }
    
    if (!match) {
      throw new Error('Invalid GitHub URL format. Expected: https://github.com/username/repo or username/repo');
    }
    
    return {
      owner: match[1],
      repo: match[2]
    };
  }

  // Test connection to GitHub
  async testConnection() {
    try {
      const url = `https://api.github.com/repos/${this.owner}/${this.repo}`;
      const response = await fetch(url, {
        headers: this.headers
      });
      
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
      return { 
        success: true, 
        data: repoInfo,
        message: `Connected to ${repoInfo.full_name}`
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        details: 'Make sure: 1) Repo exists 2) Token is valid 3) Token has "repo" permission'
      };
    }
  }

  // PUSH function - Simple and reliable
async push(shortcuts, sha = null) {
  try {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.basePath}`;
    
    // Convert to JSON string (no special encoding)
    const jsonString = JSON.stringify(shortcuts, null, 2);
    
    // SIMPLE base64 encoding (works with emojis)
    const contentBase64 = btoa(unescape(encodeURIComponent(jsonString)));
    
    const payload = {
      message: `Shortcuts update ${new Date().toLocaleString()}`,
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
      } catch (e) {
        // Keep original error message
      }
      
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    return { 
      success: true, 
      sha: result.content.sha
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message
    };
  }
}

// PULL function - Simple and reliable
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
    
    // SIMPLE base64 decoding
    const jsonString = decodeURIComponent(escape(atob(result.content)));
    const shortcuts = JSON.parse(jsonString);
    
    return { 
      success: true, 
      data: shortcuts, 
      sha: result.sha,
      exists: true
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message
    };
  }
}

  // Sync: pull latest, merge with local, push back
  async sync(localShortcuts) {
    try {
      // 1. Pull latest from GitHub
      const pullResult = await this.pull();
      if (!pullResult.success) {
        throw new Error(`Failed to pull from GitHub: ${pullResult.error}`);
      }
      
      let remoteShortcuts = pullResult.data;
      let sha = pullResult.sha;
      
      // 2. If file doesn't exist on GitHub, just push local data
      if (!pullResult.exists) {
        const pushResult = await this.push(localShortcuts);
        if (!pushResult.success) {
          throw new Error(`Initial push failed: ${pushResult.error}`);
        }
        return { 
          success: true, 
          action: 'created',
          data: localShortcuts,
          message: 'Created shortcuts file on GitHub'
        };
      }
      
      // 3. Check if there are any changes
      const hasLocalChanges = this.hasChanges(remoteShortcuts, localShortcuts);
      
      if (!hasLocalChanges) {
        // No changes, just return remote data
        return { 
          success: true, 
          action: 'no_changes',
          data: remoteShortcuts,
          message: 'No changes detected'
        };
      }
      
      // 4. Merge local and remote data (simple: local wins conflicts)
      const merged = this.mergeShortcuts(remoteShortcuts, localShortcuts);
      
      // 5. Check if merge resulted in actual changes
      const mergedChanged = this.hasChanges(remoteShortcuts, merged);
      
      if (!mergedChanged) {
        // Merge didn't change anything
        return { 
          success: true, 
          action: 'no_changes',
          data: remoteShortcuts,
          message: 'No new changes to sync'
        };
      }
      
      // 6. Push merged data back
      const pushResult = await this.push(merged, sha);
      if (!pushResult.success) {
        throw new Error(`Push failed: ${pushResult.error}`);
      }
      
      return { 
        success: true, 
        action: 'synced',
        data: merged,
        message: `Synced ${Object.keys(merged).length} shortcuts with GitHub`
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
    
    // Different number of keys means changes
    if (oldKeys.length !== newKeys.length) {
      return true;
    }
    
    // Check each shortcut
    for (const key of oldKeys) {
      if (!newShortcuts[key]) {
        return true; // Key was deleted
      }
      
      // Compare text
      if (oldShortcuts[key].text !== newShortcuts[key].text) {
        return true;
      }
      
      // Compare emojis
      const oldEmojis = oldShortcuts[key].emojis || '';
      const newEmojis = newShortcuts[key].emojis || '';
      if (oldEmojis !== newEmojis) {
        return true;
      }
    }
    
    // Check for new keys
    for (const key of newKeys) {
      if (!oldShortcuts[key]) {
        return true;
      }
    }
    
    return false;
  }

  // Simple merge: local data overrides remote
  mergeShortcuts(remote, local) {
    // Start with remote data
    const merged = { ...remote };
    
    // Overwrite with local data (local wins conflicts)
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
      connected: !!this.token,
      apiUrl: `https://api.github.com/repos/${this.owner}/${this.repo}`,
      fileUrl: `https://github.com/${this.owner}/${this.repo}/blob/main/${this.basePath}`
    };
  }

  // Get file info (size, last modified, etc.)
  async getFileInfo() {
    try {
      const result = await this.pull();
      if (!result.success) {
        return result;
      }
      
      return {
        success: true,
        exists: result.exists,
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

  // Delete specific shortcut from GitHub (direct method)
  async deleteShortcut(key) {
    try {
      // Get current data
      const pullResult = await this.pull();
      if (!pullResult.success) {
        throw new Error(`Failed to get data: ${pullResult.error}`);
      }
      
      if (!pullResult.exists) {
        return { success: true, message: 'File does not exist on GitHub' };
      }
      
      const shortcuts = pullResult.data;
      const sha = pullResult.sha;
      
      // Check if key exists
      if (!shortcuts[key]) {
        return { success: true, message: 'Shortcut not found on GitHub' };
      }
      
      // Delete the key
      delete shortcuts[key];
      
      // Push updated data
      const pushResult = await this.push(shortcuts, sha);
      if (!pushResult.success) {
        throw new Error(`Failed to push: ${pushResult.error}`);
      }
      
      return {
        success: true,
        message: `Deleted "${key}" from GitHub`,
        deletedCount: 1
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
// Background service worker for Chrome extension

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Shortcut Helper extension installed');
  
  // Initialize with empty shortcuts and sync settings
  chrome.storage.sync.set({ 
    shortcuts: {},
    syncSettings: {
      enabled: false,
      repoUrl: '',
      token: '',
      autoSync: false,
      lastSync: null
    }
  });
  
  // Create alarm for auto-sync (runs every 5 minutes if auto-sync enabled)
  chrome.alarms.create('autoSync', { periodInMinutes: 5 });
});

// Handle alarms (auto-sync)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'autoSync') {
    await checkAndSync();
  }
});

// Auto-sync when shortcuts change
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'sync' && changes.shortcuts) {
    const syncSettings = await chrome.storage.sync.get('syncSettings');
    const settings = syncSettings.syncSettings || {};
    
    if (settings.enabled && settings.autoSync) {
      // Wait 2 seconds to batch changes
      setTimeout(async () => {
        await performAutoSync(settings);
      }, 2000);
    }
  }
});

async function performAutoSync(settings) {
  try {
    const result = await chrome.storage.sync.get(['shortcuts']);
    const shortcuts = result.shortcuts || {};
    
    const GitHubSync = await importGitHubSync();
    const githubSync = new GitHubSync(settings.token, settings.repoUrl);
    
    // Push current state to GitHub
    await githubSync.push(shortcuts);
    
    console.log('Auto-sync completed successfully');
  } catch (error) {
    console.error('Auto-sync failed:', error);
  }
}

// Check if sync is needed and perform it
async function checkAndSync() {
  const result = await chrome.storage.sync.get(['syncSettings']);
  const settings = result.syncSettings || {};
  
  if (settings.enabled && settings.autoSync) {
    await performSync(settings);
  }
}

// Perform the actual sync operation
async function performSync(settings) {
  try {
    const localResult = await chrome.storage.sync.get(['shortcuts']);
    const localShortcuts = localResult.shortcuts || {};
    
    const GitHubSync = await importGitHubSync();
    // 🔥 UPDATE: Pass userEmail to constructor
    const githubSync = new GitHubSync(settings.token, settings.repoUrl, settings.userEmail);
    
    const connection = await githubSync.testConnection();
    if (!connection.success) {
      console.error('GitHub sync connection failed:', connection.error);
      return;
    }
    
    const syncResult = await githubSync.sync(localShortcuts);
    
    if (syncResult.success) {
      const currentResult = await chrome.storage.sync.get(['shortcuts']);
      const currentShortcuts = currentResult.shortcuts || {};
      
      if (JSON.stringify(currentShortcuts) !== JSON.stringify(syncResult.data)) {
        await chrome.storage.sync.set({ shortcuts: syncResult.data });
      }
      
      settings.lastSync = new Date().toISOString();
      await chrome.storage.sync.set({ syncSettings: settings });
      
      console.log('Auto-sync completed successfully:', syncResult.action);
    } else {
      console.error('Auto-sync failed:', syncResult.error);
    }
  } catch (error) {
    console.error('Auto-sync error:', error);
  }
}

// Dynamically import GitHubSync class
async function importGitHubSync() {
  // Since background.js is a service worker, we need to fetch and eval the module
  try {
    // Fetch the github-sync.js file
    const response = await fetch(chrome.runtime.getURL('github-sync.js'));
    const code = await response.text();
    
    // Create a module-like environment
    const module = { exports: {} };
    const exports = {};
    
    // Wrap the code in a function that sets module.exports
    const wrappedCode = `
      (function(module, exports) {
        ${code}
        return module.exports;
      })
    `;
    
    // Evaluate the code
    const GitHubSync = eval(wrappedCode)(module, exports);
    return GitHubSync.default || GitHubSync;
  } catch (error) {
    console.error('Failed to load GitHubSync:', error);
    throw error;
  }
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getShortcuts') {
    chrome.storage.sync.get('shortcuts', (result) => {
      sendResponse({ shortcuts: result.shortcuts || {} });
    });
    return true; // Will respond asynchronously
  }
  
  if (request.action === 'syncNow') {
    // Trigger immediate sync
    chrome.storage.sync.get(['syncSettings'], async (result) => {
      const settings = result.syncSettings || {};
      if (settings.enabled) {
        await performSync(settings);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'GitHub sync not enabled' });
      }
    });
    return true;
  }
  
  if (request.action === 'getSyncStatus') {
    chrome.storage.sync.get(['syncSettings'], (result) => {
      sendResponse({ settings: result.syncSettings || {} });
    });
    return true;
  }
});
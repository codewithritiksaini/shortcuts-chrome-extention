// Background service worker for Chrome extension
importScripts('github-sync.js');

// Initialize on install or update
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Shortcut Helper extension installed or updated');

  // Check if storage is already initialized
  const result = await chrome.storage.local.get(['shortcuts', 'syncSettings']);

  const initialValues = {};
  let needsUpdate = false;

  if (!result.shortcuts) {
    initialValues.shortcuts = {};
    needsUpdate = true;
  }

  if (!result.syncSettings) {
    initialValues.syncSettings = {
      enabled: false,
      repoUrl: '',
      token: '',
      userEmail: '',
      autoSync: false,
      lastSync: null
    };
    needsUpdate = true;
  }

  // Only set if missing to prevent resetting user settings on update
  if (needsUpdate) {
    await chrome.storage.local.set(initialValues);
    console.log('Storage initialized with default values');
  } else {
    console.log('Storage already contains data, skipping initialization');
  }

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
  if (namespace === 'local' && changes.shortcuts) {
    const syncSettings = await chrome.storage.local.get('syncSettings');
    const settings = syncSettings.syncSettings || {};

    if (settings.enabled && settings.autoSync) {
      // Wait 2 seconds to batch changes
      setTimeout(async () => {
        try {
          const result = await chrome.storage.local.get(['shortcuts']);
          const localShortcuts = result.shortcuts || {};

          // Now GitHubSync is globally available via importScripts
          const githubSync = new GitHubSync(settings.token, settings.repoUrl, settings.userEmail);

          // Use sync() for proper merge (instead of direct push)
          const syncResult = await githubSync.sync(localShortcuts);

          if (syncResult.success) {
            console.log('Auto-sync completed:', syncResult.action);

            // Update local storage if GitHub had newer data
            if (syncResult.action === 'synced' || syncResult.action === 'no_changes') {
              const currentResult = await chrome.storage.local.get(['shortcuts']);
              const currentShortcuts = currentResult.shortcuts || {};

              // Only update if data changed
              if (JSON.stringify(currentShortcuts) !== JSON.stringify(syncResult.data)) {
                await chrome.storage.local.set({ shortcuts: syncResult.data });
              }
            }
          } else {
            console.error('Auto-sync failed:', syncResult.error);
          }
        } catch (error) {
          console.error('Auto-sync error:', error);
        }
      }, 2000);
    }
  }
});



// Check if sync is needed and perform it
async function checkAndSync() {
  const result = await chrome.storage.local.get(['syncSettings']);
  const settings = result.syncSettings || {};

  if (settings.enabled && settings.autoSync) {
    await performSync(settings);
  }
}

// Perform the actual sync operation
async function performSync(settings) {
  try {
    const localResult = await chrome.storage.local.get(['shortcuts']);
    const localShortcuts = localResult.shortcuts || {};

    // Now GitHubSync is globally available via importScripts
    const githubSync = new GitHubSync(settings.token, settings.repoUrl, settings.userEmail);

    // Test connection first
    const connection = await githubSync.testConnection();
    if (!connection.success) {
      console.error('GitHub sync connection failed:', connection.error);
      return;
    }

    // Perform sync
    const syncResult = await githubSync.sync(localShortcuts);

    if (syncResult.success) {
      const currentResult = await chrome.storage.local.get(['shortcuts']);
      const currentShortcuts = currentResult.shortcuts || {};

      // Only update if data changed
      if (JSON.stringify(currentShortcuts) !== JSON.stringify(syncResult.data)) {
        await chrome.storage.local.set({ shortcuts: syncResult.data });
      }

      // Update last sync time
      settings.lastSync = new Date().toISOString();
      await chrome.storage.local.set({ syncSettings: settings });

      console.log('Sync completed:', syncResult.action);
    } else {
      console.error('Sync failed:', syncResult.error);
    }
  } catch (error) {
    console.error('Sync error:', error);
  }
}



// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getShortcuts') {
    chrome.storage.local.get('shortcuts', (result) => {
      sendResponse({ shortcuts: result.shortcuts || {} });
    });
    return true; // Will respond asynchronously
  }

  if (request.action === 'syncNow') {
    // Trigger immediate sync
    chrome.storage.local.get(['syncSettings'], async (result) => {
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
    chrome.storage.local.get(['syncSettings'], (result) => {
      sendResponse({ settings: result.syncSettings || {} });
    });
    return true;
  }

  // 🔥 NEW: Get GitHub file info
  if (request.action === 'getGitHubInfo') {
    chrome.storage.local.get(['syncSettings'], async (result) => {
      const settings = result.syncSettings || {};
      if (settings.enabled && settings.token && settings.repoUrl) {
        try {
          // GitHubSync is globally available
          const githubSync = new GitHubSync(settings.token, settings.repoUrl, settings.userEmail);
          const fileInfo = await githubSync.getFileInfo();
          sendResponse({ success: true, info: fileInfo });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      } else {
        sendResponse({ success: false, error: 'GitHub not connected' });
      }
    });
    return true;
  }
});

// ===== PROGRAMMATIC INJECTION =====
// Re-inject content.js into ALL frames when a tab finishes loading.
// This is a failsafe for complex apps (Google Sheets, Office Online)
// where declarative content_scripts injection may not reach all frames.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    injectContentScript(tabId);
  }
});

// Also inject when user switches tabs (in case the page loaded before extension was ready)
chrome.tabs.onActivated.addListener((activeInfo) => {
  injectContentScript(activeInfo.tabId);
});

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ['content.js']
    });
  } catch (e) {
    // Silently fail for restricted pages (chrome://, edge://, etc.)
  }
}
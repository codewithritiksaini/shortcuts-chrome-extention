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

let isSyncing = false;
let syncDebounceTimer = null;

// Auto-sync when shortcuts change (authoritative debounced push of local changes)
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local' && changes.shortcuts) {
    const syncSettings = await chrome.storage.local.get('syncSettings');
    const settings = syncSettings.syncSettings || {};

    if (settings.enabled && settings.autoSync) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);

      syncDebounceTimer = setTimeout(async () => {
        syncDebounceTimer = null;
        if (isSyncing) return;

        isSyncing = true;
        try {
          const result = await chrome.storage.local.get(['shortcuts']);
          const localShortcuts = result.shortcuts || {};

          const githubSync = new GitHubSync(settings.token, settings.repoUrl, settings.userEmail);
          const pushResult = await githubSync.push(localShortcuts);

          if (pushResult.success) {
            settings.lastSync = new Date().toISOString();
            await chrome.storage.local.set({ syncSettings: settings });
            console.log('Auto-sync push completed successfully');
          } else {
            console.error('Auto-sync push failed:', pushResult.error);
          }
        } catch (error) {
          console.error('Auto-sync error:', error);
        } finally {
          isSyncing = false;
        }
      }, 2000);
    }
  }
});

// Check if sync is needed and perform it (scheduled alarm)
async function checkAndSync() {
  const result = await chrome.storage.local.get(['syncSettings']);
  const settings = result.syncSettings || {};

  if (settings.enabled && settings.autoSync) {
    await performSync(settings);
  }
}

// Perform the bidirectional sync operation with concurrency lock
async function performSync(settings) {
  if (isSyncing) {
    console.log('Sync already in progress, skipping concurrent request');
    return { success: false, error: 'Sync already in progress' };
  }

  isSyncing = true;
  try {
    const localResult = await chrome.storage.local.get(['shortcuts']);
    const localShortcuts = localResult.shortcuts || {};

    const githubSync = new GitHubSync(settings.token, settings.repoUrl, settings.userEmail);

    // Test connection first
    const connection = await githubSync.testConnection();
    if (!connection.success) {
      console.error('GitHub sync connection failed:', connection.error);
      return { success: false, error: connection.error };
    }

    // Perform bidirectional merge sync
    const syncResult = await githubSync.sync(localShortcuts);

    if (syncResult.success) {
      if (syncResult.action === 'synced' || syncResult.action === 'no_changes') {
        const currentResult = await chrome.storage.local.get(['shortcuts']);
        const currentShortcuts = currentResult.shortcuts || {};

        // Only update if data changed
        if (JSON.stringify(currentShortcuts) !== JSON.stringify(syncResult.data)) {
          await chrome.storage.local.set({ shortcuts: syncResult.data });
        }
      }

      // Update last sync time
      settings.lastSync = new Date().toISOString();
      await chrome.storage.local.set({ syncSettings: settings });

      console.log('Sync completed:', syncResult.action);
      return { success: true, action: syncResult.action, message: syncResult.message };
    } else {
      console.error('Sync failed:', syncResult.error);
      return { success: false, error: syncResult.error };
    }
  } catch (error) {
    console.error('Sync error:', error);
    return { success: false, error: error.message };
  } finally {
    isSyncing = false;
  }
}

// Unified message listener for popup interactions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'syncNow') {
    chrome.storage.local.get(['syncSettings'], async (result) => {
      const settings = result.syncSettings || {};
      if (settings.enabled) {
        const syncResponse = await performSync(settings);
        sendResponse(syncResponse);
      } else {
        sendResponse({ success: false, error: 'GitHub sync not enabled' });
      }
    });
    return true; // Asynchronous response
  }
});
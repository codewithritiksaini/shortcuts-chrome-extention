document.addEventListener('DOMContentLoaded', loadShortcuts);

// Event Listeners for existing buttons
document.getElementById('saveBtn').addEventListener('click', saveShortcut);
document.getElementById('clearBtn').addEventListener('click', clearAllShortcuts);

// GitHub Sync Event Listeners
document.getElementById('githubSyncBtn').addEventListener('click', openGitHubSettings);
document.getElementById('openSettingsBtn').addEventListener('click', openGitHubSettings);
document.getElementById('syncNowBtn').addEventListener('click', syncWithGitHub);
document.getElementById('cancelSync').addEventListener('click', closeGitHubModal);
document.getElementById('saveSync').addEventListener('click', saveGitHubSettings);

// GitHub Sync State
let githubSync = null;
let syncSettings = null;

// Load shortcuts and sync settings
async function loadShortcuts() {
  await loadSyncSettings();
  await loadShortcutsList();
}

// Load sync settings from storage
async function loadSyncSettings() {
  const result = await chrome.storage.local.get(['shortcuts', 'syncSettings']);
  syncSettings = result.syncSettings || {};

  // Load email field value if exists
  if (syncSettings.userEmail) {
    document.getElementById('userEmail').value = syncSettings.userEmail;
  }

  // Update UI based on sync settings
  updateGitHubUI();

  // If connected to GitHub, initialize sync WITH EMAIL
  if (syncSettings.enabled && syncSettings.token && syncSettings.repoUrl) {
    try {
      // 🔥 UPDATE: Pass userEmail to constructor
      githubSync = new GitHubSync(syncSettings.token, syncSettings.repoUrl, syncSettings.userEmail);
      showStatus('Connected to GitHub', 'success');
    } catch (error) {
      showStatus('GitHub connection error: ' + error.message, 'error');
    }
  }
}

// Update GitHub UI based on connection status
function updateGitHubUI() {
  const syncSection = document.getElementById('githubSyncSection');
  const statusDot = document.getElementById('syncStatusDot');
  const statusText = document.getElementById('syncStatusText');

  if (syncSettings.enabled) {
    syncSection.style.display = 'block';
    // 🔥 UPDATE: Show email in status
    let statusMsg = `Connected: ${syncSettings.repoUrl.split('/').slice(-1)[0]}`;
    if (syncSettings.userEmail) {
      statusMsg += ` (${syncSettings.userEmail.split('@')[0]})`;
    }
    statusText.textContent = statusMsg;
    statusDot.className = 'sync-dot on';

    document.getElementById('syncNowBtn').disabled = false;
  } else {
    syncSection.style.display = 'none';
    statusDot.className = 'status-dot';
    statusText.textContent = 'Not connected';
  }
}

// Load shortcuts list (existing function)
async function loadShortcutsList() {
  const result = await chrome.storage.local.get('shortcuts');
  const shortcuts = result.shortcuts || {};
  const list = document.getElementById('shortcutsList');
  const countElement = document.getElementById('shortcutsCount');

  // Update the count display
  const count = Object.keys(shortcuts).length;
  countElement.textContent = `${count} shortcut${count !== 1 ? 's' : ''}`;

  list.innerHTML = '';

  if (count === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-text">No shortcuts created yet</div>
      </div>
    `;
    return;
  }

  for (const [key, shortcut] of Object.entries(shortcuts)) {
    const item = document.createElement('div');
    item.className = 'shortcut-item';

    // Display emojis as badges
    let emojisHtml = '';
    if (shortcut.emojis) {
      const emojis = (shortcut.emojis.match(/[\p{Emoji_Presentation}\p{Emoji}\p{Emoji_Modifier}]/gu) || []);
      emojisHtml = `
        <div class="shortcut-emojis">
          ${emojis.slice(0, 5).map(e => `<span class="emoji-badge">${e}</span>`).join('')}
          ${emojis.length > 5 ? `<span class="emoji-badge" style="font-size: 11px; opacity: 0.7">+${emojis.length - 5}</span>` : ''}
        </div>`;
    } else {
      emojisHtml = '<div class="no-emojis">No random emojis set</div>';
    }

    item.innerHTML = `
      <div class="shortcut-header">
        <div class="shortcut-command">${key}</div>
        <div class="shortcut-actions">
          <button class="action-btn edit" data-key="${key}" title="Edit">
            ✏️
          </button>
          <button class="action-btn delete" data-key="${key}" title="Delete">
            🗑️
          </button>
        </div>
      </div>
      <div class="shortcut-content">
        <div class="shortcut-text">${shortcut.text}</div>
        ${emojisHtml}
      </div>
    `;

    list.appendChild(item);
  }

  // Add event listeners to delete buttons
  document.querySelectorAll('.action-btn.delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const key = e.target.closest('button').dataset.key;
      showDeleteConfirmation(key);
    });
  });

  // Add event listeners to edit buttons
  document.querySelectorAll('.action-btn.edit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const key = e.target.closest('button').dataset.key;
      await editShortcut(key);
    });
  });
}

// GitHub Modal Functions
function openGitHubSettings() {
  // Load existing settings
  document.getElementById('repoUrl').value = syncSettings.repoUrl || '';
  document.getElementById('githubToken').value = syncSettings.token || '';
  document.getElementById('autoSync').checked = syncSettings.autoSync || false;

  // Show modal
  document.getElementById('githubModal').style.display = 'flex';
}

function closeGitHubModal() {
  document.getElementById('githubModal').style.display = 'none';
}

async function saveGitHubSettings() {
  const repoUrl = document.getElementById('repoUrl').value.trim();
  const token = document.getElementById('githubToken').value.trim();
  const userEmail = document.getElementById('userEmail').value.trim(); // 🔥 NEW
  const autoSync = document.getElementById('autoSync').checked;

  if (!repoUrl || !token) {
    showStatus('Please enter both repository URL and access token', 'error');
    return;
  }

  try {
    // Test connection
    showStatus('Testing GitHub connection...', 'success');

    // 🔥 UPDATE: Pass userEmail to constructor
    const testSync = new GitHubSync(token, repoUrl, userEmail);
    const connection = await testSync.testConnection();

    if (!connection.success) {
      showStatus('Connection failed: ' + connection.error, 'error');
      return;
    }

    // Save settings with email
    syncSettings = {
      enabled: true,
      repoUrl: repoUrl,
      token: token,
      userEmail: userEmail, // 🔥 NEW: Save email
      autoSync: autoSync,
      lastSync: null
    };

    await chrome.storage.local.set({ syncSettings });

    // Initialize GitHub sync with email
    githubSync = testSync;

    // Update UI
    updateGitHubUI();
    closeGitHubModal();

    // Initial sync
    setTimeout(() => syncWithGitHub(), 500);

    showStatus('Successfully connected to GitHub!', 'success');
  } catch (error) {
    showStatus('Error: ' + error.message, 'error');
  }
}

// Sync button - Pull from GitHub + Push local changes
async function syncWithGitHub() {
  if (!githubSync) {
    showStatus('Not connected to GitHub', 'error');
    return;
  }

  // Update UI to show syncing
  const statusDot = document.getElementById('syncStatusDot');
  const statusText = document.getElementById('syncStatusText');
  const syncBtn = document.getElementById('syncNowBtn');

  statusDot.className = 'sync-dot loading';
  statusText.textContent = 'Syncing...';
  syncBtn.disabled = true;
  syncBtn.innerHTML = '⏳ Syncing...';

  try {
    // 1. Get local shortcuts
    const localResult = await chrome.storage.local.get('shortcuts');
    const localShortcuts = localResult.shortcuts || {};

    // 2. Get GitHub shortcuts
    const pullResult = await githubSync.pull();

    if (!pullResult.success) {
      throw new Error(`Failed to pull from GitHub: ${pullResult.error}`);
    }

    let githubShortcuts = pullResult.data;
    let sha = pullResult.sha;

    // 3. MERGE STRATEGY: GitHub + Local (GitHub data as base, overwrite with local)
    const merged = { ...githubShortcuts, ...localShortcuts };

    // 4. Push merged data to GitHub
    const pushResult = await githubSync.push(merged, sha);

    if (!pushResult.success) {
      throw new Error(`Failed to push to GitHub: ${pushResult.error}`);
    }

    // 5. Save merged data locally (so we have everything)
    await chrome.storage.local.set({ shortcuts: merged });

    // 6. Update sync settings
    syncSettings.lastSync = new Date().toISOString();
    await chrome.storage.local.set({ syncSettings });

    // Update UI
    statusDot.className = 'status-dot connected';
    statusText.textContent = `Synced ${new Date().toLocaleTimeString()}`;

    // Show success message with details
    const added = Object.keys(localShortcuts).length;
    const pulled = Object.keys(githubShortcuts).length;
    const mergedCount = Object.keys(merged).length;

    showStatus(`✅ Sync complete! Local: ${added}, GitHub: ${pulled}, Merged: ${mergedCount}`, 'success');

    // Reload shortcuts list
    await loadShortcutsList();
  } catch (error) {
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Sync failed';
    showStatus(`❌ Sync failed: ${error.message}`, 'error');
  } finally {
    // Restore sync button
    syncBtn.disabled = false;
    syncBtn.innerHTML = '🔄 Sync Now';
  }
}

// Save shortcut with auto-sync to GitHub
async function saveShortcut() {
  const shortcutInput = document.getElementById('shortcut').value.trim();
  const textInput = document.getElementById('text').value.trim();
  const emojisInput = document.getElementById('emojis').value.trim();

  if (!shortcutInput || !shortcutInput.startsWith('/')) {
    showStatus('Shortcut must start with /', 'error');
    return;
  }

  if (!textInput) {
    showStatus('Text output is required', 'error');
    return;
  }

  if (!shortcutInput.match(/^\/[a-zA-Z0-9]+$/)) {
    showStatus('Shortcut can only contain letters and numbers after /', 'error');
    return;
  }

  const shortcut = {
    text: textInput,
    emojis: emojisInput
  };

  // Get current shortcuts
  const result = await chrome.storage.local.get('shortcuts');
  const shortcuts = result.shortcuts || {};

  // Check if updating existing or creating new
  const isUpdate = shortcuts.hasOwnProperty(shortcutInput);

  // Update/Add the shortcut
  shortcuts[shortcutInput] = shortcut;

  // Save locally
  await chrome.storage.local.set({ shortcuts });

  // 🔥 DEBUG: Console log for troubleshooting
  console.log('🔄 Auto-sync attempt:', {
    githubSyncExists: !!githubSync,
    syncSettingsEnabled: syncSettings?.enabled,
    shortcutKey: shortcutInput,
    isUpdate: isUpdate
  });

  // AUTO-SYNC TO GITHUB (if connected)
  if (githubSync && syncSettings?.enabled) {
    try {
      console.log('📤 Attempting GitHub push...');

      // Pehle current state get karo GitHub se
      const pullResult = await githubSync.pull();
      console.log('📥 Pull result:', pullResult);

      if (pullResult.success) {
        // Merge: GitHub data + our new shortcut
        const updatedShortcuts = { ...pullResult.data, [shortcutInput]: shortcut };

        // Push merged data
        const pushResult = await githubSync.push(updatedShortcuts, pullResult.sha);
        console.log('📤 Push result:', pushResult);

        if (pushResult.success) {
          syncSettings.lastSync = new Date().toISOString();
          await chrome.storage.local.set({ syncSettings });
          showStatus(`✅ "${shortcutInput}" ${isUpdate ? 'updated' : 'created'} and synced with GitHub`, 'success');
        } else {
          console.error('❌ Push failed:', pushResult);
          showStatus(`✅ "${shortcutInput}" ${isUpdate ? 'updated' : 'created'} locally (GitHub: ${pushResult.error})`, 'error');
        }
      } else {
        console.error('❌ Pull failed:', pullResult);
        showStatus(`✅ "${shortcutInput}" ${isUpdate ? 'updated' : 'created'} locally (GitHub pull failed)`, 'error');
      }
    } catch (error) {
      console.error('💥 Auto-sync error:', error);
      showStatus(`✅ "${shortcutInput}" ${isUpdate ? 'updated' : 'created'} locally (GitHub error)`, 'error');
    }
  } else {
    console.log('ℹ️ GitHub sync not enabled');
    showStatus(`✅ "${shortcutInput}" ${isUpdate ? 'updated' : 'created'} successfully`, 'success');
  }

  // Clear form
  document.getElementById('shortcut').value = '';
  document.getElementById('text').value = '';
  document.getElementById('emojis').value = '';

  // Reload shortcuts list
  await loadShortcutsList();
}

async function deleteShortcut(key, deleteFromGitHub = false) {
  console.log('🗑️ DELETE START:', { key, deleteFromGitHub });

  // Get current shortcuts
  const result = await chrome.storage.local.get('shortcuts');
  let shortcuts = result.shortcuts || {};

  console.log('📊 Before delete - Total shortcuts:', Object.keys(shortcuts).length);
  console.log('🔍 Shortcut to delete exists?', shortcuts.hasOwnProperty(key));

  // Check if shortcut exists
  if (!shortcuts[key]) {
    showStatus(`Shortcut "${key}" not found`, 'error');
    return;
  }

  // Store the deleted shortcut data (for debugging)
  const deletedShortcut = shortcuts[key];

  // Delete from local
  delete shortcuts[key];

  console.log('📊 After delete - Total shortcuts:', Object.keys(shortcuts).length);

  // Save locally
  await chrome.storage.local.set({ shortcuts });
  console.log('✅ Saved locally');

  // GITHUB DELETE (if checkbox checked)
  if (githubSync && syncSettings?.enabled && deleteFromGitHub) {
    console.log('🔄 Attempting GitHub delete...');

    try {
      // METHOD 1: First get current GitHub state
      console.log('📥 Pulling from GitHub...');
      const pullResult = await githubSync.pull();
      console.log('📥 Pull result:', {
        success: pullResult.success,
        exists: pullResult.exists,
        dataCount: pullResult.exists ? Object.keys(pullResult.data).length : 0,
        sha: pullResult.sha ? 'SHA exists' : 'No SHA'
      });

      if (pullResult.success && pullResult.exists) {
        // Create updated data without the deleted key
        const githubShortcuts = pullResult.data;
        console.log('🔍 Key exists on GitHub?', githubShortcuts.hasOwnProperty(key));

        // Delete from GitHub data
        delete githubShortcuts[key];

        console.log('📤 Pushing updated data to GitHub...');
        const pushResult = await githubSync.push(githubShortcuts, pullResult.sha);
        console.log('📤 Push result:', pushResult);

        if (pushResult.success) {
          syncSettings.lastSync = new Date().toISOString();
          await chrome.storage.local.set({ syncSettings });
          console.log('✅ GitHub delete successful');
          showStatus(`✅ "${key}" deleted from local and GitHub`, 'success');
        } else {
          console.error('❌ GitHub push failed:', pushResult.error);
          showStatus(`✅ "${key}" deleted locally (GitHub: ${pushResult.error})`, 'error');
        }
      } else if (pullResult.success && !pullResult.exists) {
        // File doesn't exist on GitHub
        console.log('ℹ️ File not on GitHub, only local delete');
        showStatus(`✅ "${key}" deleted locally`, 'success');
      } else {
        // Pull failed
        console.error('❌ GitHub pull failed:', pullResult.error);
        showStatus(`✅ "${key}" deleted locally (GitHub pull failed)`, 'error');
      }
    } catch (error) {
      console.error('💥 GitHub delete error:', error);
      showStatus(`✅ "${key}" deleted locally (GitHub error)`, 'error');
    }
  } else {
    // GitHub not connected or checkbox not checked
    console.log('ℹ️ GitHub delete not requested');
    showStatus(`✅ "${key}" deleted locally`, 'success');
  }

  // Reload shortcuts list
  loadShortcutsList();
}

// Edit shortcut
async function editShortcut(key) {
  const result = await chrome.storage.local.get('shortcuts');
  const shortcuts = result.shortcuts || {};
  const shortcut = shortcuts[key];

  if (shortcut) {
    // Fill form with existing values
    document.getElementById('shortcut').value = key;
    document.getElementById('text').value = shortcut.text;
    document.getElementById('emojis').value = shortcut.emojis || '';

    // Scroll to form
    document.getElementById('shortcut').focus();

    showStatus(`Editing "${key}" - Update and save`, 'success');
  }
}

// Delete confirmation modal
// Delete confirmation modal
function showDeleteConfirmation(key) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <h3>Delete Shortcut</h3>
    </div>
    <div class="form-group">
      <p class="form-label" style="font-weight: 500;">Are you sure you want to delete <strong>${key}</strong>?</p>
      
      ${githubSync && syncSettings.enabled ? `
      <div style="margin-top: 16px;">
        <label class="checkbox-container">
          <input type="checkbox" id="deleteFromGitHub">
          <span class="checkbox-custom"></span>
          <span class="form-label" style="margin: 0;">Also delete from GitHub</span>
        </label>
      </div>
      ` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary modal-btn-cancel">Cancel</button>
      <button class="btn btn-primary modal-btn-confirm" data-key="${key}" style="background: var(--accent);">Delete</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelector('.modal-btn-cancel').addEventListener('click', () => overlay.remove());

  modal.querySelector('.modal-btn-confirm').addEventListener('click', async (e) => {
    const keyToDelete = e.target.dataset.key;
    const deleteFromGitHub = modal.querySelector('#deleteFromGitHub') ?
      modal.querySelector('#deleteFromGitHub').checked : false;

    await deleteShortcut(keyToDelete, deleteFromGitHub);
    overlay.remove();
  });
}

// Clear all shortcuts with confirmation
// Clear all shortcuts with confirmation
async function clearAllShortcuts() {
  const result = await chrome.storage.local.get(['shortcuts', 'syncSettings']);
  const shortcuts = result.shortcuts || {};
  const syncSettings = result.syncSettings || {};

  if (Object.keys(shortcuts).length === 0) {
    showStatus('No shortcuts to clear', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <h3>Clear All</h3>
    </div>
    <div class="form-group">
      <p class="form-label" style="font-weight: 500;">Delete all <strong>${Object.keys(shortcuts).length}</strong> shortcuts?</p>
      
      ${syncSettings.enabled ? `
      <div style="margin-top: 16px;">
        <label class="checkbox-container">
          <input type="checkbox" id="clearFromGitHub" checked>
          <span class="checkbox-custom"></span>
          <span class="form-label" style="margin: 0;">Also clear from GitHub</span>
        </label>
      </div>
      ` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary modal-btn-cancel">Cancel</button>
      <button class="btn btn-primary modal-btn-confirm" style="background: var(--accent);">Clear All</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelector('.modal-btn-cancel').addEventListener('click', () => overlay.remove());

  modal.querySelector('.modal-btn-confirm').addEventListener('click', async () => {
    const clearFromGitHub = modal.querySelector('#clearFromGitHub') ?
      modal.querySelector('#clearFromGitHub').checked : false;

    await chrome.storage.local.set({ shortcuts: {} });

    if (syncSettings.enabled && clearFromGitHub && githubSync) {
      try {
        await githubSync.push({});
        syncSettings.lastSync = new Date().toISOString();
        await chrome.storage.local.set({ syncSettings });
      } catch (error) {
        console.error('GitHub clear failed:', error);
      }
    }

    showStatus('All shortcuts cleared', 'success');
    overlay.remove();
    loadShortcutsList();
  });
}

// Status message function
function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  status.style.display = 'flex';

  setTimeout(() => {
    status.style.opacity = '0';
    setTimeout(() => {
      status.style.display = 'none';
      status.style.opacity = '1';
    }, 300);
  }, 4000);
}
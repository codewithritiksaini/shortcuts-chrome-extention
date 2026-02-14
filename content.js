// Main content script for detecting and handling shortcuts

class ShortcutManager {
  constructor() {
    this.shortcuts = {};
    this.previewElement = null;
    this.currentMatch = null;
    this.init();
  }

  async init() {
    await this.loadShortcuts();
    this.setupEventListeners();
    this.setupMutationObserver();
  }

  async loadShortcuts() {
    const result = await chrome.storage.local.get('shortcuts');
    this.shortcuts = result.shortcuts || {};
  }

  setupEventListeners() {
    // Listen for storage changes to update shortcuts
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.shortcuts) {
        this.shortcuts = changes.shortcuts.newValue || {};
      }
    });

    // Listen for input events
    document.addEventListener('input', this.handleInput.bind(this));
    document.addEventListener('click', this.handleClick.bind(this));
    document.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  setupMutationObserver() {
    // Observe DOM changes for dynamically loaded content (like in Gmail, WhatsApp Web)
    const observer = new MutationObserver(() => {
      this.attachToInputs();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  attachToInputs() {
    // Attach event listeners to all inputs and textareas
    const inputs = document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]');
    inputs.forEach(input => {
      if (!input.dataset.shortcutListener) {
        input.addEventListener('input', this.handleInput.bind(this));
        input.addEventListener('keydown', this.handleKeydown.bind(this));
        input.dataset.shortcutListener = 'true';
      }
    });
  }

  handleInput(e) {
    const target = e.target;
    const value = this.getValue(target);

    // Clear any existing preview
    this.removePreview();

    // FIXED: Check for BOTH patterns - with count AND without count
    // Pattern 1: /shortcut:count (with emoji count)
    const matchWithCount = value.match(/\/([a-zA-Z0-9]+):(\d+)$/);

    // Pattern 2: /shortcut (without count - for text only)
    const matchWithoutCount = value.match(/\/([a-zA-Z0-9]+)$/);

    if (matchWithCount) {
      const shortcutKey = `/${matchWithCount[1]}`;
      const count = parseInt(matchWithCount[2], 10);

      if (this.shortcuts[shortcutKey]) {
        this.currentMatch = {
          target,
          shortcutKey,
          count,
          position: this.getCaretPosition(target),
          hasCount: true,
          fullText: this.generateText(shortcutKey, count)
        };
        this.showPreview(target, shortcutKey, count);
      }
    }
    else if (matchWithoutCount) {
      const shortcutKey = `/${matchWithoutCount[1]}`;

      if (this.shortcuts[shortcutKey]) {
        this.currentMatch = {
          target,
          shortcutKey,
          count: 0, // No emojis needed
          position: this.getCaretPosition(target),
          hasCount: false,
          fullText: this.generateText(shortcutKey, 0)
        };
        this.showPreview(target, shortcutKey, 0);
      }
    }
  }

  // Generate full text with emojis
  generateText(shortcutKey, count) {
    const shortcut = this.shortcuts[shortcutKey];
    if (!shortcut) return '';

    let finalText = shortcut.text;

    // Only add emojis if count > 0 AND shortcut has emojis
    if (shortcut.emojis && count > 0) {
      const randomEmojis = this.getRandomEmojis(shortcut.emojis, count);
      if (randomEmojis) {
        finalText += ' ' + randomEmojis;
      }
    }

    return finalText;
  }

  handleKeydown(e) {
    // Hide preview on Escape
    if (e.key === 'Escape') {
      this.removePreview();
    }

    // INSERT ON TAB KEY PRESS
    if (e.key === 'Tab' && this.previewElement && this.currentMatch) {
      e.preventDefault(); // Prevent default tab behavior
      this.replaceShortcut();
      return;
    }

    // INSERT ON ENTER KEY PRESS (optional)
    if (e.key === 'Enter' && this.previewElement && this.currentMatch) {
      e.preventDefault(); // Prevent form submission
      this.replaceShortcut();
      return;
    }

    // Hide preview when typing outside shortcut
    if (e.key !== ':' && !e.key.match(/[0-9]/) && e.key !== 'Backspace') {
      const value = this.getValue(e.target);
      // FIXED: Check for both patterns
      if (!value.match(/\/[a-zA-Z0-9]+(:?\d*)$/)) {
        this.removePreview();
      }
    }
  }

  handleClick(e) {
    // If click is on preview (but not on the copy button)
    if (e.target.closest('.shortcut-preview')) {
      if (!e.target.closest('.copy-btn')) {
        this.replaceShortcut();
      }
    }
    // If click is elsewhere, remove preview
    else if (this.previewElement && !this.previewElement.contains(e.target)) {
      this.removePreview();
    }
  }

  // NEW: Proper function to split emojis correctly
  splitEmojis(emojiString) {
    if (!emojiString) return [];

    // This regex properly splits emojis including combined emojis and skin tone modifiers
    const emojiRegex = /[\p{Emoji_Presentation}\p{Emoji}\p{Emoji_Modifier}]/gu;
    const emojis = emojiString.match(emojiRegex) || [];

    // Filter out any whitespace or empty strings
    return emojis.filter(emoji => emoji.trim() !== '');
  }

  // NEW: Function to get random emojis
  getRandomEmojis(emojiString, count) {
    if (!emojiString || count <= 0) return '';

    const emojis = this.splitEmojis(emojiString);
    if (emojis.length === 0) return '';

    let result = '';
    for (let i = 0; i < count; i++) {
      const randomIndex = Math.floor(Math.random() * emojis.length);
      result += emojis[randomIndex];
    }

    return result;
  }

  showPreview(inputElement, shortcutKey, count) {
    const shortcut = this.shortcuts[shortcutKey];
    if (!shortcut) return;

    // Generate preview text
    let previewText = shortcut.text;

    // Only add emojis if count > 0 AND shortcut has emojis
    if (shortcut.emojis && count > 0) {
      const randomEmojis = this.getRandomEmojis(shortcut.emojis, count);
      if (randomEmojis) {
        previewText += ' ' + randomEmojis;
      }
    }

    // Remove existing preview
    this.removePreview();

    // Create preview element with INLINE COPY BUTTON
    this.previewElement = document.createElement('div');
    this.previewElement.className = 'shortcut-preview';
    this.previewElement.innerHTML = `
      <div class="preview-content">
        <div class="preview-text">${previewText}</div>
        <div class="preview-footer">
          <div class="preview-hint">
            Click or <kbd>Tab</kbd> to insert 
            <button class="copy-btn" title="Copy to clipboard">📋 Copy</button>
          </div>
        </div>
      </div>
    `;

    // Add click listener for the whole preview (auto-insert)
    this.previewElement.addEventListener('click', (e) => {
      // Use composedPath to find target across shadow boundary if needed, 
      // but since listener is ON the key element, e.target should work fine within context
      if (!e.target.closest('.copy-btn')) {
        e.stopPropagation();
        this.replaceShortcut();
      }
    });

    // Add click listener for COPY button
    this.previewElement.querySelector('.copy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyToClipboard(previewText);
    });

    // IMPROVED: Use Shadow DOM
    this.ensureShadowDom();

    // Add improved styles (inside shadow DOM)
    this.addImprovedStyles();

    this.shadowRoot.appendChild(this.previewElement);

    // Position it
    this.positionAboveInput(inputElement);

    // Focus the input back so Tab key works
    inputElement.focus();
  }

  ensureShadowDom() {
    if (this.shadowHost) return;

    // Create host element
    this.shadowHost = document.createElement('div');
    this.shadowHost.id = 'shortcut-helper-host';
    // Reset all styles on host to prevent inheritance
    this.shadowHost.style.all = 'initial';
    this.shadowHost.style.position = 'absolute';
    this.shadowHost.style.top = '0';
    this.shadowHost.style.left = '0';
    this.shadowHost.style.zIndex = '9999999999';
    this.shadowHost.style.pointerEvents = 'none'; // Let clicks pass through helper host, but not its children

    document.body.appendChild(this.shadowHost);

    // Create shadow root
    this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });
  }

  // Add improved styles with inline button
  addImprovedStyles() {
    // Check if styles already exist in shadow root
    if (this.shadowRoot.getElementById('shortcut-improved-styles')) return;

    const style = document.createElement('style');
    style.id = 'shortcut-improved-styles';
    style.textContent = `
      :host {
        all: initial;
        font-family: sans-serif;
      }

      .shortcut-preview {
        background: #ffffff;
        color: #1e293b;
        padding: 16px;
        border-radius: 16px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        font-family: 'Outfit', -apple-system, sans-serif;
        font-size: 14px;
        cursor: pointer;
        border: 1px solid #e2e8f0;
        animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        max-width: 340px;
        pointer-events: auto; /* Re-enable pointer events for the popup */
        box-sizing: border-box;
      }
      
      .shortcut-preview:hover {
        transform: translateY(-2px);
        border-color: #6366f1;
      }
      
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .preview-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      
      .preview-text {
        font-size: 14px;
        line-height: 1.5;
        max-height: 120px;
        overflow-y: auto;
        padding: 12px;
        background: #f8fafc;
        border-radius: 10px;
        border: 1px solid #f1f5f9;
        color: #334155;
        box-sizing: border-box;
      }
      
      .preview-footer {
        display: flex;
        justify-content: center;
        align-items: center;
      }
      
      .preview-hint {
        font-size: 12px;
        color: #64748b;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
      }
      
      .preview-hint kbd {
        background: #f1f5f9;
        padding: 2px 6px;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
        font-family: monospace;
        font-weight: 700;
        color: #4f46e5;
      }
      
      .copy-btn {
        background: #4f46e5;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .copy-btn:hover {
        background: #3730a3;
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(79, 70, 229, 0.2);
      }
    `;

    this.shadowRoot.appendChild(style);
  }

  // Copy text to clipboard
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);

      // Show success feedback
      const copyBtn = this.previewElement.querySelector('.copy-btn');
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = '✅ Copied';
      copyBtn.style.background = 'rgba(16, 185, 129, 0.3)';
      copyBtn.style.borderColor = 'rgba(16, 185, 129, 0.6)';

      // Revert after 1.5 seconds
      setTimeout(() => {
        // Check if element still exists in shadow DOM
        if (copyBtn && this.previewElement && this.shadowRoot.contains(this.previewElement)) {
          copyBtn.innerHTML = originalHTML;
          copyBtn.style.background = '';
          copyBtn.style.borderColor = '';
        }
      }, 1500);

    } catch (error) {
      console.error('Failed to copy:', error);

      // Show error feedback
      const copyBtn = this.previewElement.querySelector('.copy-btn');
      if (copyBtn) {
        copyBtn.innerHTML = '❌ Error';
        copyBtn.style.background = 'rgba(239, 68, 68, 0.3)';
        copyBtn.style.borderColor = 'rgba(239, 68, 68, 0.6)';

        setTimeout(() => {
          if (copyBtn && this.previewElement && this.shadowRoot.contains(this.previewElement)) {
            copyBtn.innerHTML = '📋 Copy';
            copyBtn.style.background = '';
            copyBtn.style.borderColor = '';
          }
        }, 1500);
      }
    }
  }

  // IMPROVED: Always position above input
  positionAboveInput(inputElement) {
    const rect = inputElement.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    // Calculate preview height dynamically
    // Note: Since it's in shadow DOM, we might need to wait for render or use fixed assumptions first
    const previewHeight = this.previewElement.offsetHeight || 160;

    // Always position ABOVE the input
    let top = rect.top + scrollY - previewHeight - 10; // 10px gap above

    // If not enough space above, position below
    const spaceAbove = rect.top - scrollY;
    if (spaceAbove < previewHeight + 20) {
      top = rect.bottom + scrollY + 10; // 10px gap below
    }

    // Center horizontally relative to input
    let left = rect.left + scrollX;
    const previewWidth = 340;
    const inputWidth = rect.width;

    // Center the preview relative to input
    left = left + (inputWidth / 2) - (previewWidth / 2);

    // Make sure it doesn't go off screen
    const viewportWidth = window.innerWidth;
    if (left < scrollX + 10) {
      left = scrollX + 10;
    }
    if (left + previewWidth > viewportWidth + scrollX - 10) {
      left = viewportWidth + scrollX - previewWidth - 10;
    }

    // Important: Position relative to the document since shadow host is at 0,0 fixed/absolute
    this.previewElement.style.position = 'fixed'; // Use fixed to be relative to viewport
    // Adjust top/left for fixed positioning (subtract scroll) or use absolute if host is document-relative
    // Better approach: Host is document.body child. 
    // Let's make the preview absolute within the host.

    // Recalculate for absolute positioning relative to document (since host is at 0,0 absolute)
    this.previewElement.style.position = 'absolute';
    this.previewElement.style.top = `${top}px`;
    this.previewElement.style.left = `${left}px`;
    this.previewElement.style.zIndex = '10000';
    this.previewElement.style.maxWidth = `${previewWidth}px`;
  }

  removePreview() {
    if (this.previewElement) {
      this.previewElement.remove();
      this.previewElement = null;
      this.currentMatch = null;
    }
  }

  async replaceShortcut() {
    if (!this.currentMatch) return;

    const { target, shortcutKey, count, fullText } = this.currentMatch;
    const shortcut = this.shortcuts[shortcutKey];

    if (!shortcut) {
      this.removePreview();
      return;
    }

    // Use the pre-generated text
    const finalText = fullText || this.generateText(shortcutKey, count);

    // Get current value and replace shortcut
    let currentValue = this.getValue(target);

    // FIXED: Handle both with and without count
    let shortcutPattern;
    if (count > 0) {
      shortcutPattern = `${shortcutKey}:${count}`;
    } else {
      shortcutPattern = shortcutKey; // Just the shortcut without :count
    }

    const startIndex = currentValue.lastIndexOf(shortcutPattern);

    if (startIndex !== -1) {
      const newValue = currentValue.substring(0, startIndex) +
        finalText +
        currentValue.substring(startIndex + shortcutPattern.length);

      this.setValue(target, newValue);

      // Set cursor position after inserted text
      const newCursorPos = startIndex + finalText.length;
      this.setCaretPosition(target, newCursorPos);

      // Dispatch input event to trigger any website listeners
      const inputEvent = new Event('input', { bubbles: true, composed: true });
      target.dispatchEvent(inputEvent);

      // Dispatch change event for form inputs
      const changeEvent = new Event('change', { bubbles: true, composed: true });
      target.dispatchEvent(changeEvent);
    }

    this.removePreview();
  }

  // Helper methods for different input types
  getValue(element) {
    if (element.isContentEditable) {
      // For contenteditable, we need to preserve formatting
      return element.innerText || element.textContent || '';
    }
    return element.value || '';
  }

  setValue(element, value) {
    if (element.isContentEditable) {
      // For contenteditable, preserve cursor and formatting
      const selection = window.getSelection();
      const range = document.createRange();

      // Set the text content
      element.textContent = value;

      // Try to restore cursor position at the end
      range.selectNodeContents(element);
      range.collapse(false); // Collapse to end
      selection.removeAllRanges();
      selection.addRange(range);

      // Trigger input event
      const event = new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText'
      });
      element.dispatchEvent(event);
    } else {
      // For regular inputs
      element.value = value;

      // Trigger events
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    // Focus the element
    element.focus();
  }

  getCaretPosition(element) {
    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const clonedRange = range.cloneRange();
        clonedRange.selectNodeContents(element);
        clonedRange.setEnd(range.endContainer, range.endOffset);
        return clonedRange.toString().length;
      }
      return 0;
    }
    return element.selectionStart || 0;
  }

  setCaretPosition(element, position) {
    if (element.isContentEditable) {
      const range = document.createRange();
      const selection = window.getSelection();
      let charCount = 0;
      let node;

      const treeWalker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      while ((node = treeWalker.nextNode())) {
        const nextCharCount = charCount + node.length;
        if (position <= nextCharCount) {
          range.setStart(node, position - charCount);
          range.setEnd(node, position - charCount);
          break;
        }
        charCount = nextCharCount;
      }

      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      element.focus();
      element.setSelectionRange(position, position);
    }
  }
}

// Initialize the shortcut manager when page loads
let shortcutManager;

function initializeShortcutManager() {
  if (!shortcutManager) {
    shortcutManager = new ShortcutManager();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeShortcutManager);
} else {
  initializeShortcutManager();
}
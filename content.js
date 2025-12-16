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
    const result = await chrome.storage.sync.get('shortcuts');
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
          hasCount: true
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
          hasCount: false
        };
        this.showPreview(target, shortcutKey, 0);
      }
    }
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
    // If click is on preview, replace text
    if (e.target.closest('.shortcut-preview')) {
      this.replaceShortcut();
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
    
    // Update hint text based on whether it has count or not
    let hintText = '';
    if (count > 0) {
      hintText = `<span class="preview-count">${count} emoji${count !== 1 ? 's' : ''}</span>
                  <span class="preview-hint">
                    <span class="hint-action">Click</span> or press 
                    <span class="hint-key">Tab</span> to insert • 
                    <span class="hint-key">Esc</span> to cancel
                  </span>`;
    } else {
      hintText = `<span class="preview-hint">
                    <span class="hint-action">Click</span> or press 
                    <span class="hint-key">Tab</span> to insert • 
                    <span class="hint-key">Esc</span> to cancel
                  </span>`;
    }

    // Remove existing preview
    this.removePreview();

    // Create preview element
    this.previewElement = document.createElement('div');
    this.previewElement.className = 'shortcut-preview';
    this.previewElement.innerHTML = `
      <div class="preview-content">
        <div class="preview-text">${previewText}</div>
        <div class="preview-meta">
          ${hintText}
        </div>
      </div>
    `;

    // Add click listener directly to the preview element
    this.previewElement.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent the document click handler from removing it
      this.replaceShortcut();
    });

    // Smart positioning
    this.positionPreviewSmart(inputElement);
    
    document.body.appendChild(this.previewElement);
    
    // Focus the input back so Tab key works
    inputElement.focus();
  }

  // Smart positioning
  positionPreviewSmart(inputElement) {
    const rect = inputElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    
    // Default position below the input
    let top = rect.bottom + scrollY + 5;
    let left = rect.left + scrollX;
    
    // Check if preview would go below screen
    const previewHeight = 90; // Approximate height
    const spaceBelow = viewportHeight - (rect.bottom - scrollY);
    const spaceAbove = rect.top - scrollY;
    
    // If not enough space below AND enough space above, show ABOVE
    if (spaceBelow < previewHeight && spaceAbove > previewHeight) {
      top = rect.top + scrollY - previewHeight - 5;
    }
    // If not enough space on either side, adjust to stay in viewport
    else if (spaceBelow < previewHeight) {
      top = scrollY + viewportHeight - previewHeight - 10;
    }
    
    // Make sure preview stays within viewport horizontally
    const previewWidth = 350;
    if (left + previewWidth > viewportWidth + scrollX) {
      left = viewportWidth + scrollX - previewWidth - 10;
    }
    if (left < scrollX + 10) {
      left = scrollX + 10;
    }
    
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

    const { target, shortcutKey, count } = this.currentMatch;
    const shortcut = this.shortcuts[shortcutKey];
    
    if (!shortcut) {
      this.removePreview();
      return;
    }

    // Generate final text
    let finalText = shortcut.text;
    
    // Only add emojis if count > 0 AND shortcut has emojis
    if (shortcut.emojis && count > 0) {
      const randomEmojis = this.getRandomEmojis(shortcut.emojis, count);
      if (randomEmojis) {
        finalText += ' ' + randomEmojis;
      }
    }

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
// Main content script for detecting and handling shortcuts
(function () {
  'use strict';

  // Prevent duplicate initialization from programmatic re-injection
  if (window.__shortcutHelperInitialized) return;
  window.__shortcutHelperInitialized = true;

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

      // LAYER 1: Standard input events in capture phase
      document.addEventListener('input', this.handleInput.bind(this), true);
      document.addEventListener('click', this.handleClick.bind(this));
      document.addEventListener('keydown', this.handleKeydown.bind(this), true);
      document.addEventListener('compositionend', this.handleInput.bind(this), true);
      document.addEventListener('focusin', this.handleFocusIn.bind(this), true);

      // LAYER 2: keyup in capture phase — MOST RELIABLE for complex apps
      // keyup fires even when apps stopPropagation on input/keydown
      document.addEventListener('keyup', (e) => {
        // After key is released, check the active element for shortcut patterns
        const active = document.activeElement;
        if (active && this.isEditableElement(active)) {
          // Create a synthetic event-like object pointing to the active element
          this.handleInput({ target: active });
        }
      }, true);

      // LAYER 3: Polling fallback — checks every 300ms for shortcut patterns
      // This is the ultimate brute-force approach for apps that block ALL events
      this.startPolling();
    }

    // Check if an element is editable
    isEditableElement(el) {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'submit' && el.type !== 'button') return true;
      if (tag === 'TEXTAREA') return true;
      if (el.isContentEditable) return true;
      if (el.getAttribute('contenteditable') !== null) return true;
      if (el.getAttribute('role') === 'textbox') return true;
      if (el.getAttribute('role') === 'combobox') return true;
      if (el.getAttribute('role') === 'searchbox') return true;
      return false;
    }

    // Polling fallback: periodically check active element for shortcut patterns
    startPolling() {
      this._lastPolledValue = '';
      this._lastPolledElement = null;
      this._pollDebugCounter = 0;
      setInterval(() => {
        // Try multiple strategies to find the editable element
        const elements = this.findAllEditableTargets();

        // Debug: log every 10th poll to avoid flooding console
        this._pollDebugCounter++;
        if (this._pollDebugCounter % 10 === 0 && elements.size > 0) {
          for (const el of elements) {
            const val = this.getValue(el);
          }
        }

        for (const el of elements) {
          const value = this.getValue(el);
          if (!value) continue;

          // Check if value contains any shortcut patterns
          const hasPattern = value.match(/\/[a-zA-Z0-9]+(:?\S*)$/) || value.includes('/cal:');
          if (hasPattern && (value !== this._lastPolledValue || el !== this._lastPolledElement)) {
            this._lastPolledValue = value;
            this._lastPolledElement = el;
            this.handleInput({ target: el });
            break; // Only handle the first match
          }
        }
      }, 300);
    }

    // Get the deeply-nested active element (traversing iframes and shadow DOMs)
    getDeepActiveElement() {
      let el = document.activeElement;
      while (el) {
        // If active element is an iframe, try to get its document's activeElement
        if (el.tagName === 'IFRAME') {
          try {
            const iframeDoc = el.contentDocument || el.contentWindow?.document;
            if (iframeDoc && iframeDoc.activeElement) {
              el = iframeDoc.activeElement;
              continue;
            }
          } catch (e) {
            // Cross-origin iframe - can't access
            break;
          }
        }
        // If active element has a shadow root, check its activeElement
        if (el.shadowRoot && el.shadowRoot.activeElement) {
          el = el.shadowRoot.activeElement;
          continue;
        }
        break;
      }
      return el;
    }

    // Find all possible editable targets across the page
    findAllEditableTargets() {
      const targets = new Set();

      // Strategy 1: Deep active element
      const deepActive = this.getDeepActiveElement();
      if (deepActive && this.isEditableElement(deepActive)) {
        targets.add(deepActive);
      }

      // Strategy 2: Standard activeElement
      const active = document.activeElement;
      if (active && this.isEditableElement(active)) {
        targets.add(active);
      }

      // Strategy 3: Directly query for known editor elements (Google Sheets/Docs, Office)
      const knownSelectors = [
        '#waffle-rich-text-editor',        // Google Sheets cell editor
        '.cell-input',                      // Google Sheets formula bar
        '.docs-texteventtarget-iframe',     // Google Docs text event target
        '[role="textbox"][contenteditable]', // Generic rich text editors
        '[role="combobox"][contenteditable]',// Google Sheets combobox editor
        '.notranslate[contenteditable]',    // Many rich text editors
        '[data-placeholder][contenteditable]', // Slate.js editors
        '.ql-editor',                       // Quill editors
        '.ProseMirror',                     // ProseMirror editors  
        '.tox-edit-area__iframe',           // TinyMCE editors
        '.cke_editable',                    // CKEditor
      ];

      for (const selector of knownSelectors) {
        try {
          const els = document.querySelectorAll(selector);
          els.forEach(el => {
            if (el.tagName === 'IFRAME') {
              // Try to get the editable element inside the iframe
              try {
                const iframeDoc = el.contentDocument || el.contentWindow?.document;
                if (iframeDoc) {
                  const iframeEditable = iframeDoc.querySelector('[contenteditable]') ||
                    iframeDoc.querySelector('textarea') ||
                    iframeDoc.querySelector('body');
                  if (iframeEditable) targets.add(iframeEditable);
                }
              } catch (e) { /* cross-origin */ }
            } else {
              targets.add(el);
            }
          });
        } catch (e) { /* invalid selector */ }
      }

      // Strategy 4: Check all iframes for editable content
      try {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
              const iframeActive = iframeDoc.activeElement;
              if (iframeActive && this.isEditableElement(iframeActive)) {
                targets.add(iframeActive);
              }
            }
          } catch (e) { /* cross-origin */ }
        });
      } catch (e) { }

      return targets;
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
      // Broad selector to catch standard inputs, textareas, and all contenteditable variants
      // Also catches role="textbox" (used by many web apps) and Google Sheets' cell editor
      const inputs = document.querySelectorAll(
        'input[type="text"], input:not([type]), textarea, ' +
        '[contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], ' +
        '[role="textbox"], [role="combobox"], [role="searchbox"], ' +
        '.cell-input, .docs-texteventtarget-iframe, ' +
        '[data-sheets-value], [aria-label*="cell"], ' +
        '.waffle-cell-editor'
      );
      inputs.forEach(input => {
        if (!input.dataset.shortcutListener) {
          input.addEventListener('input', this.handleInput.bind(this));
          input.addEventListener('keydown', this.handleKeydown.bind(this));
          input.addEventListener('compositionend', this.handleInput.bind(this));
          input.dataset.shortcutListener = 'true';
        }
      });
    }

    // Dynamically attach listeners when any element gets focus
    handleFocusIn(e) {
      const el = e.target;
      if (!el || el.dataset.shortcutListener) return;

      // Check if this element is editable
      const isEditable = (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.isContentEditable ||
        el.getAttribute('contenteditable') !== null ||
        el.getAttribute('role') === 'textbox' ||
        el.getAttribute('role') === 'combobox' ||
        el.getAttribute('role') === 'searchbox'
      );

      if (isEditable) {
        el.addEventListener('input', this.handleInput.bind(this));
        el.addEventListener('keydown', this.handleKeydown.bind(this));
        el.addEventListener('compositionend', this.handleInput.bind(this));
        el.dataset.shortcutListener = 'true';
      }
    }

    handleInput(e) {
      // Use event target, but fallback to activeElement for apps like Google Sheets
      // where the event target might be a container, not the actual input
      let target = e.target;
      if (!target.value && !target.isContentEditable && !target.getAttribute('contenteditable')) {
        const active = document.activeElement;
        if (active && (active.value !== undefined || active.isContentEditable || active.getAttribute('contenteditable') !== null)) {
          target = active;
        }
      }
      const value = this.getValue(target);

      // Skip if value hasn't changed — prevents preview flickering from multiple listeners
      if (value === this._lastHandledValue && this.previewElement) {
        return;
      }
      this._lastHandledValue = value;

      // Clear any existing preview
      this.removePreview();

      // ===== STEP 1: Check for /cal: FIRST (highest priority) =====
      if (value.includes('/cal:')) {
        const calMatch = value.match(/\/cal:(.+)$/);
        if (calMatch) {
          const expression = calMatch[1];
          // Only try to calculate if expression has content
          if (expression.length > 0) {
            const result = this.calculate(expression);
            if (result !== null) {
              // Valid complete expression - show result
              this.currentMatch = {
                target,
                shortcutKey: '/cal',
                count: 0,
                position: this.getCaretPosition(target),
                hasCount: false,
                fullText: result.toString()
              };
              this.showPreview(target, '/cal', 0, expression + ' = ' + result);
            } else {
              // Incomplete expression (like "20*") - show typing indicator
              this.currentMatch = {
                target,
                shortcutKey: '/cal',
                count: 0,
                position: this.getCaretPosition(target),
                hasCount: false,
                fullText: ''
              };
              this.showPreview(target, '/cal', 0, '🔢 ' + expression + ' = ...');
            }
          }
          return; // Always stop here for /cal
        }
      }

      // ===== STEP 2: /shortcut:count (e.g. /lorem:10) =====
      const matchWithCount = value.match(/\/([a-zA-Z0-9]+):(\d+)$/);

      // ===== STEP 3: /shortcut (e.g. /hello) =====
      const matchWithoutCount = value.match(/\/([a-zA-Z0-9]+)$/);

      if (matchWithCount) {
        const shortcutKey = '/' + matchWithCount[1];
        const count = parseInt(matchWithCount[2], 10);

        if (shortcutKey === '/lorem') {
          // Limit lorem to 1000 words max
          if (count > 1000) {
            this.currentMatch = {
              target,
              shortcutKey,
              count,
              position: this.getCaretPosition(target),
              hasCount: true,
              fullText: ''
            };
            this.showPreview(target, shortcutKey, count, '<span style="color:#ff4444;font-weight:bold;font-size:14px;">⚠️ Error: Maximum 1000 words allowed!<br>You requested ' + count + ' words.</span>');
            return;
          }
          const loremText = this.generateLoremIpsum(count);
          this.currentMatch = {
            target,
            shortcutKey,
            count,
            position: this.getCaretPosition(target),
            hasCount: true,
            fullText: loremText
          };
          this.showPreview(target, shortcutKey, count, loremText);
          return;
        }

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
        const shortcutKey = '/' + matchWithoutCount[1];

        if (this.shortcuts[shortcutKey]) {
          this.currentMatch = {
            target,
            shortcutKey,
            count: 0,
            position: this.getCaretPosition(target),
            hasCount: false,
            fullText: this.generateText(shortcutKey, 0)
          };
          this.showPreview(target, shortcutKey, 0);
        }
      }
    }

    // Safe Calculator - uses recursive descent parser (no eval/new Function)
    // CSP blocks eval/new Function in content scripts, so we parse manually
    calculate(expression) {
      try {
        const sanitized = expression.replace(/[^0-9+\-*/%().\s]/g, '').trim();
        if (!sanitized || sanitized.length === 0) return null;
        if (!/[0-9]/.test(sanitized)) return null;

        // Tokenize
        const tokens = sanitized.match(/(\d+\.?\d*|[+\-*/%()])/g);
        if (!tokens) return null;

        let pos = 0;

        const peek = () => tokens[pos];
        const consume = () => tokens[pos++];

        // Grammar: expr = term (('+' | '-') term)*
        const parseExpr = () => {
          let left = parseTerm();
          while (peek() === '+' || peek() === '-') {
            const op = consume();
            const right = parseTerm();
            left = op === '+' ? left + right : left - right;
          }
          return left;
        };

        // term = factor (('*' | '/' | '%') factor)*
        const parseTerm = () => {
          let left = parseFactor();
          while (peek() === '*' || peek() === '/' || peek() === '%') {
            const op = consume();
            const right = parseFactor();
            if (op === '*') left = left * right;
            else if (op === '/') left = right !== 0 ? left / right : Infinity;
            else left = left % right;
          }
          return left;
        };

        // factor = number | '(' expr ')' | '-' factor
        const parseFactor = () => {
          if (peek() === '(') {
            consume(); // '('
            const val = parseExpr();
            if (peek() === ')') consume(); // ')'
            return val;
          }
          if (peek() === '-') {
            consume();
            return -parseFactor();
          }
          const token = consume();
          if (token === undefined) return NaN;
          return parseFloat(token);
        };

        const result = parseExpr();

        // Check we consumed all tokens
        if (pos !== tokens.length) return null;

        if (result === undefined || result === null) return null;
        if (!isFinite(result) || isNaN(result)) return 'Error';

        if (Number.isInteger(result)) {
          return result;
        } else {
          return parseFloat(result.toFixed(4));
        }
      } catch (e) {
        return null;
      }
    }

    // Generate Lorem Ipsum words
    generateLoremIpsum(count) {
      if (count <= 0) return '';
      // Hard safety cap — never generate more than 1000 words
      if (count > 1000) count = 1000;

      const loremBase = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

      const words = loremBase.split(/\s+/);

      let result = [];
      while (result.length < count) {
        result = result.concat(words);
      }

      return result.slice(0, count).join(' ');
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
        e.preventDefault();
        this.replaceShortcut();
        return;
      }

      // INSERT ON ENTER KEY PRESS
      if (e.key === 'Enter' && this.previewElement && this.currentMatch) {
        e.preventDefault();
        this.replaceShortcut();
        return;
      }

      // Allow calculator operator keys without hiding preview
      const isCalculatorKey = /[+\-*/%().]/.test(e.key);

      if (e.key !== ':' && !e.key.match(/[0-9]/) && e.key !== 'Backspace' && !isCalculatorKey) {
        const value = this.getValue(e.target);
        const isShortcutPattern = value.match(/\/[a-zA-Z0-9]+(:?\d*)$/);
        const isCalculatorPattern = value.match(/\/cal:.+$/);
        if (!isShortcutPattern && !isCalculatorPattern) {
          this.removePreview();
        }
      }

      // For calculator operator keys, re-evaluate after key is inserted into input
      if (isCalculatorKey) {
        const target = e.target;
        setTimeout(() => {
          const value = this.getValue(target);
          const calMatch = value.match(/\/cal:([0-9+\-*/%().\s]+)$/);
          if (calMatch) {
            const expression = calMatch[1].trim();
            const result = this.calculate(expression);
            if (result !== null) {
              this.removePreview();
              this.currentMatch = {
                target,
                shortcutKey: '/cal',
                count: 0,
                position: this.getCaretPosition(target),
                hasCount: false,
                fullText: result.toString()
              };
              this.showPreview(target, '/cal', 0, expression + ' = ' + result);
            }
          }
        }, 0);
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

    showPreview(inputElement, shortcutKey, count, directText = null) {
      // If directText is provided (e.g. for lorem ipsum), use it. 
      // Otherwise look up shortcut.
      let previewText = '';

      if (directText) {
        previewText = directText;
      } else {
        const shortcut = this.shortcuts[shortcutKey];
        if (!shortcut) return;

        // Generate preview text from shortcut
        previewText = shortcut.text;

        // Only add emojis if count > 0 AND shortcut has emojis
        if (shortcut.emojis && count > 0) {
          const randomEmojis = this.getRandomEmojis(shortcut.emojis, count);
          if (randomEmojis) {
            previewText += ' ' + randomEmojis;
          }
        }
      }

      // Remove existing preview
      this.removePreview();

      // Create preview element with ALL INLINE STYLES for maximum compatibility
      // This ensures the preview works on ANY website (Google Sheets, Office, etc.)
      this.previewElement = document.createElement('div');
      this.previewElement.id = 'shortcut-helper-preview-root';
      this.previewElement.style.cssText = `
        position: fixed !important;
        z-index: 2147483647 !important;
        background: white !important;
        border: 1px solid #e0e0e0 !important;
        border-radius: 10px !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15) !important;
        padding: 12px 16px !important;
        max-width: 340px !important;
        max-height: 200px !important;
        overflow-y: auto !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 13px !important;
        color: #333 !important;
        line-height: 1.5 !important;
        pointer-events: auto !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      `;

      // Preview text
      const textDiv = document.createElement('div');
      textDiv.style.cssText = 'margin-bottom: 8px !important; word-break: break-word !important;';
      textDiv.innerHTML = previewText;

      // Footer with hint + copy button
      const footerDiv = document.createElement('div');
      footerDiv.style.cssText = `
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        border-top: 1px solid #eee !important;
        padding-top: 8px !important;
        margin-top: 4px !important;
        font-size: 11px !important;
        color: #888 !important;
      `;

      const hintSpan = document.createElement('span');
      hintSpan.innerHTML = 'Click or <kbd style="background:#f0f0f0;padding:1px 5px;border-radius:3px;border:1px solid #ddd;font-size:10px;">Tab</kbd> to insert';

      const copyBtn = document.createElement('button');
      copyBtn.textContent = '📋 Copy';
      copyBtn.style.cssText = `
        background: #f5f5f5 !important;
        border: 1px solid #ddd !important;
        border-radius: 6px !important;
        padding: 3px 8px !important;
        cursor: pointer !important;
        font-size: 11px !important;
        color: #555 !important;
      `;

      footerDiv.appendChild(hintSpan);
      footerDiv.appendChild(copyBtn);
      this.previewElement.appendChild(textDiv);
      this.previewElement.appendChild(footerDiv);

      // Add click listener for the whole preview (auto-insert)
      this.previewElement.addEventListener('click', (e) => {
        if (e.target !== copyBtn) {
          e.stopPropagation();
          this.replaceShortcut();
        }
      });

      // Add click listener for COPY button
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.copyToClipboard(previewText);
      });

      // ALWAYS append to document.body with fixed positioning
      // This bypasses all CSS stacking/overflow issues in complex apps
      if (document.body) {
        document.body.appendChild(this.previewElement);
      } else {
        return;
      }

      // Position it
      this.positionAboveInput(inputElement);

      // Focus the input back so Tab key works
      inputElement.focus();
    }

    ensureShadowDom() {
      if (this.shadowHost) return;
      if (!document.body) return; // No body in this frame

      try {
        // Create host element
        this.shadowHost = document.createElement('div');
        this.shadowHost.id = 'shortcut-helper-host';
        // Reset all styles on host to prevent inheritance
        this.shadowHost.style.all = 'initial';
        this.shadowHost.style.position = 'absolute';
        this.shadowHost.style.top = '0';
        this.shadowHost.style.left = '0';
        this.shadowHost.style.zIndex = '9999999999';
        this.shadowHost.style.pointerEvents = 'none';

        document.body.appendChild(this.shadowHost);

        // Create shadow root
        this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });
      } catch (e) {
        // Shadow DOM creation failed (e.g., restricted frame)
        this.shadowHost = null;
      }
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

      // Use fixed positioning relative to viewport for maximum compatibility
      // This works even in complex apps like Google Sheets with nested scroll containers
      this.previewElement.style.position = 'fixed';
      this.previewElement.style.top = `${rect.top - previewHeight - 10}px`;

      // If not enough space above, position below
      if (rect.top < previewHeight + 20) {
        this.previewElement.style.top = `${rect.bottom + 10}px`;
      }

      this.previewElement.style.left = `${left - scrollX}px`; // Convert to viewport coords for fixed
      this.previewElement.style.zIndex = '2147483647'; // Maximum z-index
      this.previewElement.style.maxWidth = `${previewWidth}px`;
      this.previewElement.style.pointerEvents = 'auto'; // Allow clicks on preview
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

      // If it's a special command or valid shortcut
      if (!shortcut && shortcutKey !== '/lorem' && shortcutKey !== '/cal') {
        this.removePreview();
        return;
      }

      // Use the pre-generated text
      const finalText = fullText || this.generateText(shortcutKey, count);

      // Get current value and replace shortcut
      let currentValue = this.getValue(target);

      // FIXED: Handle different patterns
      let shortcutPattern;
      if (shortcutKey === '/cal') {
        const value = this.getValue(target);
        const match = value.match(/\/cal:(.+)$/);
        shortcutPattern = match ? match[0] : '/cal';
      } else if (count > 0) {
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
        // For contenteditable, trim trailing whitespace/newlines
        // (Google Sheets, Docs etc. add trailing \n to innerText)
        return (element.innerText || element.textContent || '').trim();
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new ShortcutManager());
  } else {
    new ShortcutManager();
  }

})(); // End IIFE
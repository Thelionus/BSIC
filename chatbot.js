/**
 * BSIC Bénin — Chatbot Widget (chatbot.js)
 * Floating AI assistant powered by Claude
 */

(function () {
  'use strict';

  // ─── Configuration ─────────────────────────────────────────────────────────
  const API_URL = '/api/chat';
  const WELCOME_DELAY_MS = 900; // delay before showing welcome message

  // ─── State ─────────────────────────────────────────────────────────────────
  let conversationHistory = [];
  let isStreaming = false;
  let isOpen = false;
  let hasShownWelcome = false;

  // ─── DOM references (set after inject) ─────────────────────────────────────
  let panel, trigger, badge, messagesEl, inputEl, form, sendBtn;

  // ─── HTML Template ──────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <!-- Floating trigger button -->
      <button id="bsic-chat-trigger" aria-label="Ouvrir l'assistant BSIC">
        <!-- Chat icon -->
        <svg class="chat-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <!-- Close icon -->
        <svg class="close-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        <span id="bsic-chat-badge">1</span>
      </button>

      <!-- Chat panel -->
      <div id="bsic-chat-panel" role="dialog" aria-label="Assistant BSIC" aria-hidden="true">

        <!-- Header -->
        <div id="bsic-chat-header">
          <div class="bsic-avatar">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1
                14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <div class="bsic-header-info">
            <div class="bsic-header-name">Assistant BSIC</div>
            <div class="bsic-header-status">En ligne</div>
          </div>
          <div class="bsic-header-actions">
            <button class="bsic-header-btn" id="bsic-clear-btn" title="Effacer la conversation" aria-label="Effacer">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
            <button class="bsic-header-btn" id="bsic-close-btn" title="Fermer" aria-label="Fermer">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Messages -->
        <div id="bsic-chat-messages" role="log" aria-live="polite" aria-label="Conversation">
        </div>

        <!-- Input -->
        <div id="bsic-chat-input-area">
          <form id="bsic-chat-form" autocomplete="off">
            <textarea
              id="bsic-chat-input"
              placeholder="Posez votre question..."
              rows="1"
              maxlength="1000"
              aria-label="Votre message"
            ></textarea>
            <button type="submit" id="bsic-send-btn" aria-label="Envoyer">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </form>
          <div class="bsic-input-hint">Alimenté par l'IA · BSIC Bénin</div>
        </div>

      </div>
    `;
  }

  // ─── Inject widget into DOM ──────────────────────────────────────────────────
  function inject() {
    const wrapper = document.createElement('div');
    wrapper.id = 'bsic-chatbot-root';
    wrapper.innerHTML = buildHTML();
    document.body.appendChild(wrapper);

    panel      = document.getElementById('bsic-chat-panel');
    trigger    = document.getElementById('bsic-chat-trigger');
    badge      = document.getElementById('bsic-chat-badge');
    messagesEl = document.getElementById('bsic-chat-messages');
    inputEl    = document.getElementById('bsic-chat-input');
    form       = document.getElementById('bsic-chat-form');
    sendBtn    = document.getElementById('bsic-send-btn');

    bindEvents();
    showBadge(); // indicate the bot is ready
  }

  // ─── Show / hide ────────────────────────────────────────────────────────────
  function openPanel() {
    isOpen = true;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    trigger.classList.add('is-open');
    hideBadge();

    if (!hasShownWelcome) {
      hasShownWelcome = true;
      showWelcome();
    }

    setTimeout(() => inputEl.focus(), 300);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    trigger.classList.remove('is-open');
  }

  function togglePanel() {
    isOpen ? closePanel() : openPanel();
  }

  function showBadge() { badge.classList.add('visible'); }
  function hideBadge() { badge.classList.remove('visible'); }

  // ─── Welcome message + quick chips ──────────────────────────────────────────
  function showWelcome() {
    // Welcome banner
    const banner = document.createElement('div');
    banner.className = 'bsic-welcome-banner';
    banner.innerHTML = `
      <div class="bsic-welcome-logo">BSIC BÉNIN</div>
      <p>Bonjour ! Je suis votre assistant virtuel.<br>
         Comment puis-je vous aider aujourd'hui ?</p>
    `;
    messagesEl.appendChild(banner);

    // Quick-action chips
    const chipsData = [
      'Ouvrir un compte',
      'Demander un crédit',
      'Nos agences',
      'Horaires bancaires',
      'Virement & paiement',
    ];

    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'bsic-quick-chips';
    chipsData.forEach(label => {
      const chip = document.createElement('button');
      chip.className = 'bsic-chip';
      chip.textContent = label;
      chip.addEventListener('click', () => sendMessage(label));
      chipsWrap.appendChild(chip);
    });
    messagesEl.appendChild(chipsWrap);
    scrollBottom();
  }

  // ─── Render a message bubble ─────────────────────────────────────────────────
  function renderBubble(role, text) {
    const wrap = document.createElement('div');
    wrap.className = `bsic-msg ${role}`;

    const avatarEl = document.createElement('div');
    avatarEl.className = 'bsic-msg-avatar';
    avatarEl.textContent = role === 'user' ? 'V' : 'B';

    const bubble = document.createElement('div');
    bubble.className = 'bsic-msg-bubble';
    bubble.innerHTML = formatText(text);

    if (role === 'user') {
      wrap.appendChild(bubble);
      wrap.appendChild(avatarEl);
    } else {
      wrap.appendChild(avatarEl);
      wrap.appendChild(bubble);
    }

    messagesEl.appendChild(wrap);
    scrollBottom();
    return bubble;
  }

  // ─── Typing indicator ────────────────────────────────────────────────────────
  function showTyping() {
    const el = document.createElement('div');
    el.className = 'bsic-typing';
    el.id = 'bsic-typing-indicator';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    scrollBottom();
  }

  function hideTyping() {
    const el = document.getElementById('bsic-typing-indicator');
    if (el) el.remove();
  }

  // ─── Format bot response (simple markdown-like) ───────────────────────────
  function formatText(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // ─── Scroll to bottom ─────────────────────────────────────────────────────
  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ─── Send a message ──────────────────────────────────────────────────────
  async function sendMessage(text) {
    text = (text || '').trim();
    if (!text || isStreaming) return;

    // Reset textarea
    inputEl.value = '';
    inputEl.style.height = 'auto';
    setDisabled(true);
    isStreaming = true;

    // Add to history & render user bubble
    conversationHistory.push({ role: 'user', content: text });
    renderBubble('user', text);

    // Show typing
    showTyping();

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationHistory }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Create bot bubble for streaming
      hideTyping();
      let botText = '';
      const botBubble = renderBubble('bot', '');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              botBubble.innerHTML = formatText(data.error);
              break;
            }
            if (data.done) break;
            if (data.text) {
              botText += data.text;
              botBubble.innerHTML = formatText(botText);
              scrollBottom();
            }
          } catch (_) { /* skip malformed */ }
        }
      }

      // Save assistant response to history
      if (botText) {
        conversationHistory.push({ role: 'assistant', content: botText });
      }

    } catch (err) {
      hideTyping();
      renderBubble('bot', 'Désolé, une erreur est survenue. Veuillez réessayer ou contacter votre agence BSIC.');
      console.error('[BSIC Chatbot]', err);
    } finally {
      isStreaming = false;
      setDisabled(false);
      inputEl.focus();
    }
  }

  // ─── Enable / disable input ──────────────────────────────────────────────
  function setDisabled(val) {
    sendBtn.disabled = val;
    inputEl.disabled = val;
  }

  // ─── Clear conversation ──────────────────────────────────────────────────
  function clearConversation() {
    conversationHistory = [];
    messagesEl.innerHTML = '';
    hasShownWelcome = false;
    showWelcome();
  }

  // ─── Auto-resize textarea ────────────────────────────────────────────────
  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 88) + 'px';
    // Toggle overflow
    inputEl.style.overflowY = inputEl.scrollHeight > 88 ? 'auto' : 'hidden';
  }

  // ─── Bind all events ─────────────────────────────────────────────────────
  function bindEvents() {
    // Toggle button
    trigger.addEventListener('click', togglePanel);

    // Close button in header
    document.getElementById('bsic-close-btn').addEventListener('click', closePanel);

    // Clear button
    document.getElementById('bsic-clear-btn').addEventListener('click', clearConversation);

    // Form submit
    form.addEventListener('submit', e => {
      e.preventDefault();
      sendMessage(inputEl.value);
    });

    // Enter to send (Shift+Enter = newline)
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputEl.value);
      }
    });

    // Auto-resize
    inputEl.addEventListener('input', autoResize);

    // Close on outside click
    document.addEventListener('click', e => {
      if (isOpen && !panel.contains(e.target) && !trigger.contains(e.target)) {
        closePanel();
      }
    });

    // Escape key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOpen) closePanel();
    });
  }

  // ─── Boot ────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();

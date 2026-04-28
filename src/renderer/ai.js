export function initAiPanel(orion) {
  const messages = document.getElementById('messages');
  const chatInput = document.getElementById('chat-input');
  const aiPanel = document.getElementById('ai-panel');
  const btnToggleAi = document.getElementById('btn-toggle-ai');
  const btnCloseAi = document.getElementById('btn-close-ai');
  const btnSend = document.getElementById('btn-send');
  let aiOpen = false;

  function setAiOpen(open) {
    aiOpen = open;
    aiPanel.classList.toggle('hidden', !open);
    btnToggleAi.classList.toggle('active', open);
    orion.toggleSidebar(open);
  }

  function appendMsg(role, text) {
    const wrap = document.createElement('div');
    wrap.className = `msg ${role === 'user' ? 'user-msg' : 'assistant-msg'}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
    return wrap;
  }

  function appendTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant-msg';
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = 'AI';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble typing';
    bubble.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
    return wrap;
  }

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    chatInput.style.height = 'auto';
    appendMsg('user', text);

    const apiKey = await orion.storeGet('groqApiKey');
    if (!apiKey) {
      appendMsg('assistant', 'No Groq API key set. Go to Settings to add your key.');
      return;
    }

    const typingEl = appendTyping();
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are Orion AI, a helpful browser assistant. Be concise and direct.' },
            { role: 'user', content: text },
          ],
          max_tokens: 800,
          temperature: 0.7,
        }),
      });

      const data = await res.json();
      typingEl.remove();
      if (data.choices?.[0]?.message?.content) {
        appendMsg('assistant', data.choices[0].message.content);
      } else {
        appendMsg('assistant', `Error: ${data.error?.message || 'Unknown error'}`);
      }
    } catch (err) {
      typingEl.remove();
      appendMsg('assistant', `Network error: ${err.message}`);
    }
  }

  function bindEvents() {
    btnToggleAi.addEventListener('click', () => setAiOpen(!aiOpen));
    btnCloseAi.addEventListener('click', () => setAiOpen(false));
    btnSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = `${Math.min(chatInput.scrollHeight, 120)}px`;
    });
  }

  return { bindEvents };
}

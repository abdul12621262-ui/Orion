// ============================================================
//  ORION UI CONTROLLER — v2.0
//  Surface-based, keyboard-first, instant-feeling UX.
// ============================================================

const HOME_PAGE_URL = 'orion://home';

// ── ICONS ───────────────────────────────────────────────────
const ICON_GLOBE = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
  <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/>
  <path d="M1 6h10M6 1C4.5 3 4.5 9 6 11M6 1c1.5 2 1.5 8 0 10" stroke="currentColor" stroke-width="1.2"/>
</svg>`;

const ICON_CLOSE = `<svg width="9" height="9" viewBox="0 0 9 9" fill="none">
  <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;

// ── HELPERS ──────────────────────────────────────────────────
function getFaviconUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === 'orion:') return null;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return null;
  }
}

function sanitizeText(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export function createUiController(orion, store) {
  // ── DOM REFS ───────────────────────────────────────────────
  const leftRail       = document.getElementById('left-rail');
  const btnCollapseRail= document.getElementById('btn-collapse-rail');
  const tabList        = document.getElementById('tab-list');
  const addressBar     = document.getElementById('address-bar');
  const suggestions    = document.getElementById('address-suggestions');
  const omnibar        = document.getElementById('omnibar');
  const spinner        = document.getElementById('spinner');
  const pageTitle      = document.getElementById('page-title');
  const blockedNum     = document.getElementById('blocked-count');
  const btnBack        = document.getElementById('btn-back');
  const btnForward     = document.getElementById('btn-forward');
  const btnReload      = document.getElementById('btn-reload');
  const btnNewTab      = document.getElementById('btn-new-tab');

  // ── STATE ──────────────────────────────────────────────────
  let blockedCount    = 0;
  let statusResetTimer= null;
  let addressHistory  = _loadHistory();
  let suggVisible     = false;
  let selectedSuggIdx = -1;

  // Restore rail collapse state
  const savedCollapsed = localStorage.getItem('orion:rail-collapsed') === 'true';
  _setRailCollapsed(savedCollapsed);

  // ── HISTORY PERSISTENCE ────────────────────────────────────
  function _loadHistory() {
    try {
      return JSON.parse(localStorage.getItem('orion:address-history') || '[]');
    } catch {
      return [];
    }
  }

  function _saveHistory() {
    try {
      localStorage.setItem('orion:address-history', JSON.stringify(addressHistory.slice(0, 100)));
    } catch {}
  }

  function _pushHistory(url) {
    if (typeof url !== 'string' || !url.trim()) return;
    addressHistory = [url, ...addressHistory.filter(u => u !== url)].slice(0, 100);
    _saveHistory();
  }

  // ── RAIL ───────────────────────────────────────────────────
  function _setRailCollapsed(collapsed) {
    leftRail.dataset.collapsed = collapsed ? 'true' : 'false';
    try { localStorage.setItem('orion:rail-collapsed', String(collapsed)); } catch {}
  }

  // ── STATUS BAR ─────────────────────────────────────────────
  function _setStatus(text, durationMs = 2400) {
    pageTitle.textContent = text;
    clearTimeout(statusResetTimer);
    statusResetTimer = setTimeout(() => {
      const tab = store.getActiveTab();
      pageTitle.textContent = tab ? (tab.title || '') : '';
    }, durationMs);
  }

  // ── NAV STATE ──────────────────────────────────────────────
  function _renderNavigationState() {
    const tab = store.getActiveTab();
    if (!tab) return;

    // Only update address bar if it's not focused (don't interrupt typing)
    if (document.activeElement !== addressBar) {
      addressBar.value = tab.url || '';
    }

    pageTitle.textContent = tab.title || '';
    spinner.classList.toggle('hidden', !tab.loading);
    btnBack.disabled    = !tab.canGoBack;
    btnForward.disabled = !tab.canGoForward;

    // Update reload icon: ✕ while loading, ↺ otherwise
    btnReload.innerHTML = tab.loading
      ? `<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`
      : `<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M10.8 6.5a4.3 4.3 0 1 1-1.06-2.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M9.74 2l.5 2.2-2.2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
  }

  // ── TAB RENDERING ──────────────────────────────────────────
  function _renderTabs() {
    const tabs   = store.getTabs();
    const active = store.getActiveTab();
    tabList.innerHTML = '';

    for (const tab of tabs) {
      const isActive = active && tab.id === active.id;
      const el = document.createElement('div');
      el.className = `tab-item${isActive ? ' active' : ''}`;
      el.dataset.id = String(tab.id);
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', String(isActive));
      el.title = tab.title || tab.url || 'New Tab';

      // Favicon
      const faviconEl = document.createElement('div');
      faviconEl.className = 'tab-favicon';
      const faviconUrl = getFaviconUrl(tab.url);
      if (faviconUrl) {
        const img = document.createElement('img');
        img.src = faviconUrl;
        img.width = 14;
        img.height = 14;
        img.loading = 'lazy';
        img.onerror = () => { faviconEl.innerHTML = ICON_GLOBE; };
        faviconEl.appendChild(img);
      } else {
        faviconEl.innerHTML = ICON_GLOBE;
      }

      // Title
      const titleEl = document.createElement('div');
      titleEl.className = 'tab-title';
      titleEl.textContent = tab.title || (tab.url || 'New Tab');

      // Loading indicator
      if (tab.loading) {
        const dot = document.createElement('span');
        dot.className = 'tab-loading-dot';
        dot.setAttribute('aria-hidden', 'true');
        dot.textContent = '●';
        titleEl.appendChild(dot);
      }

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close';
      closeBtn.setAttribute('aria-label', 'Close tab');
      closeBtn.innerHTML = ICON_CLOSE;
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Ripple on close
        closeBtn.style.transform = 'scale(0.8)';
        setTimeout(() => orion.closeTab(tab.id), 80);
      });

      el.appendChild(faviconEl);
      el.appendChild(titleEl);
      el.appendChild(closeBtn);
      el.addEventListener('click', () => orion.switchTab(tab.id));

      // Middle-click to close
      el.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          orion.closeTab(tab.id);
        }
      });

      tabList.appendChild(el);
    }
  }

  // ── SUGGESTIONS ────────────────────────────────────────────
  function _hideSuggestions() {
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    suggVisible = false;
    selectedSuggIdx = -1;
  }

  function _showSuggestions(input) {
    const query = input.trim().toLowerCase();
    if (!query) { _hideSuggestions(); return; }

    const fromTabs = store.getTabs().map(t => t.url).filter(Boolean);
    const pool = [...new Set([...addressHistory, ...fromTabs])];
    const urlMatches = pool
      .filter(item => item.toLowerCase().includes(query))
      .slice(0, 4);

    const items = [
      ...urlMatches,
      `https://search.brave.com/search?q=${encodeURIComponent(input.trim())}`,
    ].slice(0, 6);

    suggestions.innerHTML = '';
    items.forEach((value, i) => {
      const btn = document.createElement('button');
      btn.className = 'address-suggestion-item';
      btn.type = 'button';
      btn.setAttribute('role', 'option');

      // Distinguish search vs url
      const isSearch = value.includes('search.brave.com');
      const iconSvg = isSearch
        ? `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" style="flex-shrink:0;opacity:0.5">
            <circle cx="5" cy="5" r="4" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8.5 8.5l2.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
           </svg>`
        : `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" style="flex-shrink:0;opacity:0.5">
            <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/>
            <path d="M1 6h10M6 1C4.5 3 4.5 9 6 11M6 1c1.5 2 1.5 8 0 10" stroke="currentColor" stroke-width="1.2"/>
           </svg>`;

      btn.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:8px;width:100%">
          ${iconSvg}
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sanitizeText(value)}</span>
        </span>`;

      btn.addEventListener('click', () => {
        addressBar.value = value;
        _hideSuggestions();
        orion.navigate(value);
        _pushHistory(value);
      });

      suggestions.appendChild(btn);
    });

    suggestions.classList.remove('hidden');
    suggVisible = true;
    selectedSuggIdx = -1;
  }

  function _navigateSuggestions(direction) {
    const items = suggestions.querySelectorAll('.address-suggestion-item');
    if (!items.length) return;
    items[selectedSuggIdx]?.removeAttribute('aria-selected');
    selectedSuggIdx = (selectedSuggIdx + direction + items.length) % items.length;
    const selected = items[selectedSuggIdx];
    selected.setAttribute('aria-selected', 'true');
    selected.style.background = 'rgba(91,111,255,0.14)';
    // Fill address bar with hovered suggestion
    const textEl = selected.querySelector('span > span:last-child');
    if (textEl) addressBar.value = textEl.textContent.trim();
  }

  // ── PUBLIC CALLBACKS ────────────────────────────────────────
  function onTabsState(payload) {
    store.applyTabsState(payload);
    _renderNavigationState();
    _renderTabs();
  }

  function onUrlChanged(url) {
    store.updateActiveTabPatch({ url: typeof url === 'string' ? url : '' });
    _pushHistory(url);
    store.updateActiveTabPatch({ favicon: getFaviconUrl(url) });
    _renderNavigationState();
    _renderTabs();
  }

  function onTitleChanged(title) {
    store.updateActiveTabPatch({ title: title || 'Untitled' });
    _renderNavigationState();
    _renderTabs();
  }

  function onLoading(loading) {
    store.updateActiveTabPatch({ loading: !!loading });
    _renderNavigationState();
    _renderTabs();
  }

  function onBlocked() {
    blockedCount += 1;
    blockedNum.textContent = String(blockedCount);
    // Brief flash on blocked count
    blockedNum.style.color = '#34d39b';
    setTimeout(() => { blockedNum.style.color = ''; }, 500);
  }

  function onNavigationInvalid() {
    omnibar.classList.add('invalid-url');
    _setStatus('Invalid address — try a URL or search query');
    setTimeout(() => omnibar.classList.remove('invalid-url'), 900);
  }

  // ── EVENT BINDING ───────────────────────────────────────────
  function bindEvents() {
    // Rail collapse
    btnCollapseRail.addEventListener('click', () => {
      _setRailCollapsed(leftRail.dataset.collapsed !== 'true');
    });

    // Navigation
    btnBack.addEventListener('click', () => orion.goBack());
    btnForward.addEventListener('click', () => orion.goForward());
    btnReload.addEventListener('click', () => {
      const tab = store.getActiveTab();
      if (tab?.loading) orion.stopLoading?.();
      else orion.reload();
    });
    btnNewTab.addEventListener('click', () => orion.createTab(HOME_PAGE_URL));

    // Address bar — keyboard
    addressBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = addressBar.value.trim();
        orion.navigate(val);
        _pushHistory(val);
        addressBar.blur();
        _hideSuggestions();
        return;
      }
      if (e.key === 'Escape') {
        addressBar.blur();
        _hideSuggestions();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _navigateSuggestions(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        _navigateSuggestions(-1);
        return;
      }
    });

    addressBar.addEventListener('focus', () => {
      // Small delay so the select() call doesn't get cancelled
      requestAnimationFrame(() => addressBar.select());
      _showSuggestions(addressBar.value);
    });

    addressBar.addEventListener('input', () => {
      _showSuggestions(addressBar.value);
    });

    addressBar.addEventListener('blur', () => {
      // Small delay to allow suggestion click to fire first
      setTimeout(_hideSuggestions, 150);
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;

      // ⌘K / Ctrl+K — focus address bar
      if (mod && e.key === 'k') {
        e.preventDefault();
        addressBar.focus();
        addressBar.select();
        return;
      }

      // ⌘L / Ctrl+L — focus address bar (browser convention)
      if (mod && e.key === 'l') {
        e.preventDefault();
        addressBar.focus();
        addressBar.select();
        return;
      }

      // ⌘T / Ctrl+T — new tab
      if (mod && e.key === 't') {
        e.preventDefault();
        orion.createTab(HOME_PAGE_URL);
        return;
      }

      // ⌘W / Ctrl+W — close tab
      if (mod && e.key === 'w') {
        e.preventDefault();
        const tab = store.getActiveTab();
        if (tab) orion.closeTab(tab.id);
        return;
      }

      // ⌘R / Ctrl+R — reload
      if (mod && e.key === 'r') {
        e.preventDefault();
        orion.reload();
        return;
      }

      // ⌘[ / Alt+Left — back
      if ((mod && e.key === '[') || (e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        orion.goBack();
        return;
      }

      // ⌘] / Alt+Right — forward
      if ((mod && e.key === ']') || (e.altKey && e.key === 'ArrowRight')) {
        e.preventDefault();
        orion.goForward();
        return;
      }
    });
  }

  return {
    bindEvents,
    onTabsState,
    onUrlChanged,
    onTitleChanged,
    onLoading,
    onBlocked,
    onNavigationInvalid,
  };
}
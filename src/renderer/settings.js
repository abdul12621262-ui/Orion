// ============================================================
//  ORION SETTINGS PANEL — v2.0
//  Command-palette search, animated cards, premium toggles.
// ============================================================

const CATEGORY_META = {
  privacy:     { label: 'Privacy',     icon: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L1.5 3.5v3.8C1.5 10.5 4 13 7 13.8 10 13 12.5 10.5 12.5 7.3V3.5L7 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>' },
  security:    { label: 'Security',    icon: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3" y="6" width="8" height="6" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 6V4.5a2 2 0 1 1 4 0V6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' },
  performance: { label: 'Performance', icon: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h2l2-4 2 8 2-6 1 2h1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  appearance:  { label: 'Appearance',  icon: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' },
  advanced:    { label: 'Advanced',    icon: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M2 7h6M2 10h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="11" cy="10" r="1.5" stroke="currentColor" stroke-width="1.2"/></svg>' },
};

function _getCategoryMeta(category) {
  return CATEGORY_META[category] ?? { label: category, icon: '' };
}

function _sanitize(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── SETTING CONTROL FACTORY ──────────────────────────────────
function _createSettingControl(feature, key, value, onUpdate) {
  const row = document.createElement('div');
  row.className = 'feature-setting-row';

  const label = document.createElement('label');
  label.textContent = _humanizeKey(key);
  row.appendChild(label);

  // Boolean → premium toggle
  if (typeof value === 'boolean') {
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'feature-toggle';
    toggle.checked = value;
    toggle.style.width = '34px';
    toggle.style.height = '19px';
    toggle.addEventListener('change', () => onUpdate({ [key]: toggle.checked }));
    row.appendChild(toggle);
    return row;
  }

  // Number
  if (typeof value === 'number') {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.addEventListener('change', () => {
      const parsed = Number(input.value);
      if (Number.isFinite(parsed)) onUpdate({ [key]: parsed });
    });
    row.appendChild(input);
    return row;
  }

  // Array → multiline textarea
  if (Array.isArray(value)) {
    const textarea = document.createElement('textarea');
    textarea.value = value.join('\n');
    textarea.placeholder = 'One entry per line…';
    textarea.rows = Math.min(value.length + 1, 5);
    textarea.addEventListener('change', () => {
      const items = textarea.value.split('\n').map(s => s.trim()).filter(Boolean);
      onUpdate({ [key]: items });
    });
    row.appendChild(textarea);
    return row;
  }

  // String / fallback
  const input = document.createElement('input');
  input.type = 'text';
  input.value = String(value ?? '');
  input.placeholder = key;
  input.addEventListener('change', () => onUpdate({ [key]: input.value }));
  row.appendChild(input);
  return row;
}

function _humanizeKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

// ── MAIN EXPORT ──────────────────────────────────────────────
export function initSettingsPanel(orion) {
  // DOM refs
  const panel           = document.getElementById('settings-panel');
  const btnOpen         = document.getElementById('btn-open-settings');
  const btnClose        = document.getElementById('btn-close-settings');
  const searchInput     = document.getElementById('settings-search');
  const sidebar         = document.getElementById('settings-sidebar');
  const featureList     = document.getElementById('settings-feature-list');
  const importExportBox = document.getElementById('settings-import-export');
  const btnResetAll     = document.getElementById('btn-reset-all-settings');
  const btnExport       = document.getElementById('btn-export-settings');
  const btnImport       = document.getElementById('btn-import-settings');

  // State
  let snapshot     = { registry: [], state: {} };
  let activeCategory = null;
  let searchQuery    = '';

  // ── OPEN / CLOSE ────────────────────────────────────────────
  function _openPanel() {
    panel.classList.remove('hidden');
    orion.setSettingsPanelVisibility(true);
    searchInput.focus();
  }

  function _closePanel() {
    panel.classList.add('hidden');
    orion.setSettingsPanelVisibility(false);
  }

  // ── CATEGORIES ──────────────────────────────────────────────
  function _getCategories() {
    return [...new Set(snapshot.registry.map(f => f.category))];
  }

  function _renderCategories() {
    sidebar.innerHTML = '';
    const categories = _getCategories();
    if (!activeCategory && categories.length) activeCategory = categories[0];

    for (const cat of categories) {
      const meta = _getCategoryMeta(cat);
      const btn = document.createElement('button');
      btn.className = `settings-category-btn${cat === activeCategory ? ' active' : ''}`;
      btn.setAttribute('aria-current', cat === activeCategory ? 'page' : 'false');
      btn.innerHTML = `${meta.icon}<span>${_sanitize(meta.label)}</span>`;
      btn.addEventListener('click', () => {
        activeCategory = cat;
        searchInput.value = '';
        searchQuery = '';
        _renderCategories();
        _renderFeatures();
      });
      sidebar.appendChild(btn);
    }
  }

  // ── FEATURE CARDS ────────────────────────────────────────────
  function _getRuntime(id) {
    return snapshot.state[id] ?? { enabled: false, settings: {} };
  }

  function _renderFeatures() {
    const query = searchQuery.toLowerCase().trim();
    featureList.innerHTML = '';

    // When searching, show across all categories
    const filtered = snapshot.registry.filter(f => {
      if (query) {
        return (
          f.name.toLowerCase().includes(query) ||
          f.id.toLowerCase().includes(query) ||
          (f.description || '').toLowerCase().includes(query)
        );
      }
      return f.category === activeCategory;
    });

    if (!filtered.length) {
      featureList.innerHTML = `
        <div style="
          padding: 48px 24px;
          text-align: center;
          color: var(--text-tertiary);
          font-size: 13px;
        ">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style="margin:0 auto 12px;display:block;opacity:0.3">
            <circle cx="14" cy="14" r="11" stroke="currentColor" stroke-width="1.5"/>
            <path d="M24 24l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          No settings match "<strong>${_sanitize(query)}</strong>"
        </div>`;
      return;
    }

    for (const feature of filtered) {
      const runtime = _getRuntime(feature.id);
      const card = document.createElement('article');
      card.className = 'feature-card';
      card.setAttribute('role', 'listitem');

      // Top row: label + toggle
      const topRow = document.createElement('div');
      topRow.className = 'feature-row';

      const meta = document.createElement('div');
      meta.className = 'feature-meta';
      meta.innerHTML = `
        <h4>${_sanitize(feature.name)}</h4>
        <p>${_sanitize(feature.id)}</p>
        ${feature.description ? `<p style="margin-top:4px;font-size:11.5px;color:var(--text-secondary);font-family:var(--font-ui)">${_sanitize(feature.description)}</p>` : ''}
      `;

      const toggle = document.createElement('input');
      toggle.className = 'feature-toggle';
      toggle.type = 'checkbox';
      toggle.checked = !!runtime.enabled;
      toggle.setAttribute('aria-label', `Toggle ${feature.name}`);
      toggle.addEventListener('change', () => {
        // Optimistic UI — immediately reflect the change
        toggle.checked
          ? orion.enableFeature(feature.id)
          : orion.disableFeature(feature.id);
      });

      topRow.appendChild(meta);
      topRow.appendChild(toggle);
      card.appendChild(topRow);

      // Reset button
      const resetBtn = document.createElement('button');
      resetBtn.className = 'feature-reset-btn';
      resetBtn.textContent = 'Reset to default';
      resetBtn.addEventListener('click', () => {
        orion.resetFeature(feature.id);
        _showToast(`"${feature.name}" reset`);
      });
      card.appendChild(resetBtn);

      // Sub-settings
      const runtimeSettings = runtime.settings || {};
      if (Object.keys(runtimeSettings).length > 0) {
        const settingsBox = document.createElement('div');
        settingsBox.className = 'feature-settings';

        for (const [key, value] of Object.entries(runtimeSettings)) {
          settingsBox.appendChild(
            _createSettingControl(
              feature,
              key,
              value,
              (patch) => orion.updateFeatureConfig(feature.id, patch)
            )
          );
        }
        card.appendChild(settingsBox);
      }

      featureList.appendChild(card);
    }
  }

  // ── TOAST NOTIFICATION ───────────────────────────────────────
  function _showToast(message) {
    const existing = document.getElementById('orion-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'orion-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(8px);
      background: rgba(20, 23, 38, 0.97);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 9999px;
      padding: 8px 18px;
      font-size: 12.5px;
      font-family: var(--font-ui);
      color: #eef0f8;
      box-shadow: 0 8px 32px rgba(0,0,0,0.45);
      backdrop-filter: blur(20px);
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 200ms ease, transform 200ms cubic-bezier(0.34,1.56,0.64,1);
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(6px)';
      setTimeout(() => toast.remove(), 220);
    }, 2200);
  }

  // ── BOOTSTRAP ────────────────────────────────────────────────
  async function bootstrapState() {
    snapshot = await orion.getSettingsState();
    _renderCategories();
    _renderFeatures();
  }

  // ── APPLY SETTINGS (from main process) ───────────────────────
  function applySettings(incoming) {
    snapshot = incoming;
    _renderCategories();
    _renderFeatures();

    // Theme sync
    const themeMode = snapshot.state?.themeSystem?.settings?.mode;
    document.body.dataset.theme = themeMode === 'light' ? 'light' : 'dark';
  }

  // ── EVENT BINDING ────────────────────────────────────────────
  function bindEvents() {
    btnOpen.addEventListener('click', _openPanel);
    btnClose.addEventListener('click', _closePanel);

    // Click-outside to close
    panel.addEventListener('click', (e) => {
      if (e.target === panel) _closePanel();
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.classList.contains('hidden')) {
        _closePanel();
      }
      // ⌘, / Ctrl+, — open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        panel.classList.contains('hidden') ? _openPanel() : _closePanel();
      }
    });

    // Search
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      if (searchQuery.trim()) {
        // Show all categories while searching
        _renderFeatures();
      } else {
        _renderFeatures();
      }
    });

    // Reset all
    btnResetAll.addEventListener('click', async () => {
      const confirmed = confirm('Reset all settings to defaults? This cannot be undone.');
      if (!confirmed) return;
      await orion.resetAllSettings();
      _showToast('All settings reset');
    });

    // Export
    btnExport.addEventListener('click', async () => {
      const json = await orion.exportSettings();
      importExportBox.value = json;
      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(json);
        _showToast('Settings copied to clipboard');
      } catch {
        _showToast('Settings exported to box below');
      }
    });

    // Import
    btnImport.addEventListener('click', async () => {
      const raw = importExportBox.value.trim();
      if (!raw) {
        _showToast('Paste settings JSON first');
        return;
      }
      try {
        JSON.parse(raw); // validate
        await orion.importSettings(raw);
        _showToast('Settings imported successfully');
        importExportBox.value = '';
      } catch {
        _showToast('Invalid JSON — check your input');
        importExportBox.style.borderColor = 'rgba(242,107,107,0.6)';
        setTimeout(() => { importExportBox.style.borderColor = ''; }, 1200);
      }
    });
  }

  return {
    bindEvents,
    bootstrapState,
    applySettings,
  };
}
const { app, BrowserWindow, BrowserView, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { AD_BLOCK_PATTERNS } = require('./features');
const { FeatureStore } = require('./featureStore');

const store = new Store();
const featureStore = new FeatureStore(store);

let mainWindow = null;
const tabs = new Map();
let activeTabId = null;
let nextTabId = 1;
let sidebarOpen = false;
let settingsPanelOpen = false;
let layoutMetrics = null;

const RAIL_WIDTH    = 220;
const CHROME_HEIGHT = 76; // chromebar 48 + strip 28
const SIDEBAR_WIDTH = 360;
const MAX_URL_LENGTH = 2048;
const MAX_STORE_KEY_LENGTH = 128;
const MAX_LOG_MESSAGE_LENGTH = 4000;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_POPUP_HOSTS = new Set();
const SESSION_STORE_KEY = 'session.tabs.v1';
const MAX_SESSION_TABS = 20;
const MAX_SETTINGS_PAYLOAD_LENGTH = 2_000_000;
const HOME_PAGE_URL = 'orion://home';
const HOME_PAGE_FILE = path.join(__dirname, '../renderer/home.html');
let logFilePath = '';

function initializeLogging() {
  const logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  logFilePath = path.join(logDir, 'orion-errors.log');
}

function toSafeErrorMessage(errorOrMessage) {
  if (!errorOrMessage) return 'Unknown error';
  const value = typeof errorOrMessage === 'string' ? errorOrMessage : (errorOrMessage.stack || errorOrMessage.message || String(errorOrMessage));
  return value.slice(0, MAX_LOG_MESSAGE_LENGTH);
}

function logError(source, errorOrMessage) {
  const line = `[${new Date().toISOString()}] [${source}] ${toSafeErrorMessage(errorOrMessage)}\n`;
  if (!logFilePath) return;
  fs.appendFile(logFilePath, line, (err) => {
    if (err) console.error('Failed to write log file:', err);
  });
}

function isAllowedHttpUrl(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(input);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function isHomeUrl(input) {
  return typeof input === 'string' && input.trim().toLowerCase() === HOME_PAGE_URL;
}

function isPersistableUrl(input) {
  return isAllowedHttpUrl(input) || isHomeUrl(input);
}

function normalizeNavigationTarget(urlInput) {
  const input = typeof urlInput === 'string' ? urlInput.trim() : '';
  if (!input) return HOME_PAGE_URL;
  if (input.length > MAX_URL_LENGTH) return null;
  if (isHomeUrl(input) || input.toLowerCase() === 'home') return HOME_PAGE_URL;

  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(input);
  const candidate = hasProtocol ? input : (input.includes('.') && !input.includes(' ') && input.length < 100 ? `https://${input}` : `https://search.brave.com/search?q=${encodeURIComponent(input)}`);

  if (!isAllowedHttpUrl(candidate)) return null;
  return candidate;
}

function isTrustedIpcSender(event) {
  return !!(mainWindow && !mainWindow.isDestroyed() && event && event.sender === mainWindow.webContents);
}

function isAllowedPopupUrl(url) {
  if (!isAllowedHttpUrl(url)) return false;
  try {
    return ALLOWED_POPUP_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function wildcardToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function doesHostMatchPattern(hostname, pattern) {
  if (!pattern || typeof pattern !== 'string') return false;
  const normalized = pattern.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('*.')) {
    const suffix = normalized.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  if (normalized.includes('*')) {
    return wildcardToRegex(normalized).test(hostname);
  }
  return hostname === normalized || hostname.endsWith(`.${normalized}`);
}

function isSiteBlocked(url) {
  if (!featureStore.isEnabled('siteBlocker')) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
  const hostname = parsed.hostname.toLowerCase();
  const settings = featureStore.getFeatureSettings('siteBlocker');
  const blockedSites = Array.isArray(settings.blockedSites) ? settings.blockedSites : [];
  return blockedSites.some((sitePattern) => doesHostMatchPattern(hostname, sitePattern));
}

function shouldBlockByAdFilter(url) {
  if (!featureStore.isEnabled('adBlocker')) return false;
  const settings = featureStore.getFeatureSettings('adBlocker');
  const builtInEnabled = settings.blockTrackers || settings.blockAds;
  const customList = Array.isArray(settings.customBlocklists) ? settings.customBlocklists : [];
  const allPatterns = [
    ...(builtInEnabled ? AD_BLOCK_PATTERNS : []),
    ...customList.map((item) => `*://${item}/*`),
  ];
  return allPatterns.some((pattern) => wildcardToRegex(pattern).test(url));
}

function emitSettingsState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('settings-updated', featureStore.getPublicSnapshot());
}

function getActiveTab() {
  if (!activeTabId) return null;
  return tabs.get(activeTabId) || null;
}

function sanitizeTabSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Number.isInteger(raw.id) || raw.id <= 0) return null;
  if (typeof raw.url !== 'string' || !isPersistableUrl(raw.url)) return null;
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.slice(0, 256) : 'New Tab';
  return { id: raw.id, url: raw.url, title };
}

function getSessionSnapshot() {
  const tabList = Array.from(tabs.values()).map((tab) => ({
    id: tab.id,
    url: isPersistableUrl(tab.url) ? tab.url : HOME_PAGE_URL,
    title: typeof tab.title === 'string' ? tab.title.slice(0, 256) : 'New Tab',
  }));
  const safeActive = tabList.some((tab) => tab.id === activeTabId) ? activeTabId : (tabList[0]?.id || null);
  return { activeTabId: safeActive, tabs: tabList };
}

function persistSession() {
  try {
    store.set(SESSION_STORE_KEY, getSessionSnapshot());
  } catch (err) {
    logError('session-persist-failed', err);
  }
}

function restoreSessionState() {
  try {
    const stored = store.get(SESSION_STORE_KEY);
    if (!stored || typeof stored !== 'object' || !Array.isArray(stored.tabs)) return null;
    const sanitizedTabs = stored.tabs.map(sanitizeTabSnapshot).filter(Boolean).slice(0, MAX_SESSION_TABS);
    if (sanitizedTabs.length === 0) return null;
    const activeCandidate = Number.isInteger(stored.activeTabId) ? stored.activeTabId : sanitizedTabs[0].id;
    const active = sanitizedTabs.some((tab) => tab.id === activeCandidate) ? activeCandidate : sanitizedTabs[0].id;
    return { activeTabId: active, tabs: sanitizedTabs };
  } catch (err) {
    logError('session-restore-failed', err);
    return null;
  }
}

function buildLoadErrorPage({ attemptedUrl, errorCode, errorDescription }) {
  const safeUrl = String(attemptedUrl || '').replace(/[<>&"]/g, '');
  const safeCode = String(errorCode || '').replace(/[<>&"]/g, '');
  const safeDescription = String(errorDescription || 'Failed to load this page.').replace(/[<>&"]/g, '');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Page unavailable</title>
  <style>
    body{margin:0;background:#0b0b14;color:#e4e6f5;font-family:Segoe UI,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
    .card{max-width:640px;padding:28px;border:1px solid #272a3f;border-radius:14px;background:#111427}
    h1{margin:0 0 10px;font-size:22px}
    p{margin:0 0 8px;color:#b7bbd6;line-height:1.45}
    code{display:block;margin-top:10px;padding:8px 10px;border-radius:8px;background:#0a0e20;color:#8bd0ff}
  </style>
</head>
<body>
  <div class="card">
    <h1>This site cannot be reached</h1>
    <p>Orion could not load the requested page.</p>
    <p>${safeDescription}</p>
    <code>${safeCode} ${safeUrl}</code>
  </div>
</body>
</html>`;
}

function getTabPublicState(tab) {
  return {
    id: tab.id,
    title: tab.title || 'New Tab',
    url: tab.url || 'about:blank',
    loading: !!tab.loading,
    canGoBack: tab.view.webContents.navigationHistory.canGoBack(),
    canGoForward: tab.view.webContents.navigationHistory.canGoForward(),
  };
}

function emitTabsState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const payload = {
    activeTabId,
    tabs: Array.from(tabs.values()).map(getTabPublicState),
  };
  mainWindow.webContents.send('tabs-state', payload);
  persistSession();
}

function sendActiveTabSignals() {
  const tab = getActiveTab();
  if (!tab || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('url-changed', tab.url || '');
  mainWindow.webContents.send('title-changed', tab.title || 'New Tab');
  mainWindow.webContents.send('loading', !!tab.loading);
}

function navigateTabToTarget(tab, target) {
  if (target === HOME_PAGE_URL) {
    tab.isInternalHome = true;
    tab.url = HOME_PAGE_URL;
    tab.title = 'Home';
    tab.view.webContents.loadFile(HOME_PAGE_FILE).catch((err) => logError(`tab-${tab.id}-home-load-failed`, err));
    return;
  }
  tab.isInternalHome = false;
  tab.view.webContents.loadURL(target).catch((err) => logError(`tab-${tab.id}-load-failed`, err));
}

function createTab(initialTarget = HOME_PAGE_URL) {
  const id = nextTabId++;
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:browser',
    },
  });

  const tab = {
    id,
    view,
    title: 'New Tab',
    url: 'about:blank',
    loading: false,
    isInternalHome: false,
    listeners: [],
  };
  tabs.set(id, tab);

  const webContents = view.webContents;

  const onWillNavigate = (event, url) => {
    if (!isAllowedHttpUrl(url) || isSiteBlocked(url)) {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked');
      return;
    }
    tab.isInternalHome = false;
  };

  const onDidNavigate = (_, url) => {
    tab.url = tab.isInternalHome ? HOME_PAGE_URL : url;
    if (activeTabId === id) mainWindow.webContents.send('url-changed', tab.url);
    emitTabsState();
  };

  const onDidNavigateInPage = (_, url) => {
    tab.url = tab.isInternalHome ? HOME_PAGE_URL : url;
    if (activeTabId === id) mainWindow.webContents.send('url-changed', tab.url);
    emitTabsState();
  };

  const onPageTitleUpdated = (_, title) => {
    tab.title = title || 'Untitled';
    if (activeTabId === id) mainWindow.webContents.send('title-changed', tab.title);
    emitTabsState();
  };

  const onDidStartLoading = () => {
    tab.loading = true;
    if (activeTabId === id) mainWindow.webContents.send('loading', true);
    emitTabsState();
  };

  const onDidStopLoading = () => {
    tab.loading = false;
    if (activeTabId === id) mainWindow.webContents.send('loading', false);
    emitTabsState();
  };

  const onRenderProcessGone = (_, details) => {
    logError(`tab-${id}-render-process-gone`, JSON.stringify(details));
  };

  const onDidFailLoad = (_, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    logError(`tab-${id}-did-fail-load`, `${errorCode} ${errorDescription} ${validatedURL}`);
    if (errorCode === -3) return;
    const html = buildLoadErrorPage({ attemptedUrl: validatedURL, errorCode, errorDescription });
    const dataUrl = `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
    tab.view.webContents.loadURL(dataUrl).catch((err) => logError(`tab-${id}-error-page-load-failed`, err));
  };

  webContents.on('will-navigate', onWillNavigate);
  webContents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedPopupUrl(url)) {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked');
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  webContents.on('did-navigate', onDidNavigate);
  webContents.on('did-navigate-in-page', onDidNavigateInPage);
  webContents.on('page-title-updated', onPageTitleUpdated);
  webContents.on('did-start-loading', onDidStartLoading);
  webContents.on('did-stop-loading', onDidStopLoading);
  webContents.on('render-process-gone', onRenderProcessGone);
  webContents.on('did-fail-load', onDidFailLoad);

  tab.listeners = [
    ['will-navigate', onWillNavigate],
    ['did-navigate', onDidNavigate],
    ['did-navigate-in-page', onDidNavigateInPage],
    ['page-title-updated', onPageTitleUpdated],
    ['did-start-loading', onDidStartLoading],
    ['did-stop-loading', onDidStopLoading],
    ['render-process-gone', onRenderProcessGone],
    ['did-fail-load', onDidFailLoad],
  ];

  const target = normalizeNavigationTarget(initialTarget) || HOME_PAGE_URL;
  navigateTabToTarget(tab, target);
  return id;
}

function createTabFromSnapshot(snapshot) {
  const expectedId = Number.isInteger(snapshot?.id) ? snapshot.id : nextTabId;
  const createdId = createTab(snapshot?.url || HOME_PAGE_URL);
  if (createdId !== expectedId) {
    const createdTab = tabs.get(createdId);
    tabs.delete(createdId);
    createdTab.id = expectedId;
    tabs.set(expectedId, createdTab);
  }
  if (expectedId >= nextTabId) nextTabId = expectedId + 1;
  const restoredTab = tabs.get(expectedId);
  if (restoredTab && typeof snapshot?.title === 'string' && snapshot.title.trim()) {
    restoredTab.title = snapshot.title.slice(0, 256);
  }
  return expectedId;
}

function switchToTab(tabId) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const tab = tabs.get(tabId);
  if (!tab) return false;
  activeTabId = tabId;
  mainWindow.setBrowserView(tab.view);
  updateBounds();
  sendActiveTabSignals();
  emitTabsState();
  return true;
}

function destroyTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return false;

  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.getBrowserView() === tab.view) {
    mainWindow.setBrowserView(null);
  }

  for (const [eventName, listener] of tab.listeners) {
    tab.view.webContents.removeListener(eventName, listener);
  }
  tab.view.webContents.close({ waitForBeforeUnload: false });
  tab.view.webContents.destroy();
  tabs.delete(tabId);
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#080810',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.webContents.on('will-navigate', (event) => {
    // Renderer should never navigate main app shell.
    event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('resize', updateBounds);
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    logError('main-render-process-gone', JSON.stringify(details));
  });
  mainWindow.on('closed', () => {
    for (const tabId of Array.from(tabs.keys())) destroyTab(tabId);
    activeTabId = null;
    tabs.clear();
    mainWindow = null;
  });

  const restored = restoreSessionState();
  if (restored) {
    for (const snapshot of restored.tabs) createTabFromSnapshot(snapshot);
    if (!switchToTab(restored.activeTabId)) {
      const fallbackId = tabs.keys().next().value;
      if (Number.isInteger(fallbackId)) switchToTab(fallbackId);
    }
  } else {
    const firstTabId = createTab(HOME_PAGE_URL);
    switchToTab(firstTabId);
  }
}

function updateBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const tab = getActiveTab();
  if (!tab) return;
  if (settingsPanelOpen) {
    tab.view.setBounds({ x: -10000, y: -10000, width: 1, height: 1 });
    return;
  }
  if (layoutMetrics) {
    tab.view.setBounds({
      x: layoutMetrics.x,
      y: layoutMetrics.y,
      width: Math.max(100, layoutMetrics.width),
      height: Math.max(100, layoutMetrics.height),
    });
    return;
  }

  const [w, h] = mainWindow.getContentSize();
  const rightOffset = sidebarOpen ? SIDEBAR_WIDTH : 0;
  tab.view.setBounds({
    x: RAIL_WIDTH,
    y: CHROME_HEIGHT,
    width: Math.max(100, w - RAIL_WIDTH - rightOffset),
    height: Math.max(100, h - CHROME_HEIGHT),
  });
}

// ── IPC ──
ipcMain.on('navigate', (event, url) => {
  if (!isTrustedIpcSender(event)) return;
  const tab = getActiveTab();
  if (!tab) return;
  const target = normalizeNavigationTarget(url);
  if (!target) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('blocked');
      mainWindow.webContents.send('navigation-invalid', { input: typeof url === 'string' ? url : '' });
    }
    return;
  }
  if (isSiteBlocked(target)) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked');
    return;
  }
  navigateTabToTarget(tab, target);
});

ipcMain.on('go-back', (event) => {
  if (!isTrustedIpcSender(event)) return;
  const tab = getActiveTab();
  if (!tab) return;
  if (tab.view.webContents.navigationHistory.canGoBack()) {
  tab.view.webContents.navigationHistory.goBack();
}
});

ipcMain.on('go-forward', (event) => {
  if (!isTrustedIpcSender(event)) return;
  const tab = getActiveTab();
  if (!tab) return;
  if (tab.view.webContents.navigationHistory.canGoForward()) {
  tab.view.webContents.navigationHistory.goForward();
}
});

ipcMain.on('reload', (event) => {
  if (!isTrustedIpcSender(event)) return;
  const tab = getActiveTab();
  if (!tab) return;
  tab.view.webContents.reload();
});

ipcMain.on('tab-create', (event, url) => {
  if (!isTrustedIpcSender(event)) return;
  if (typeof url !== 'undefined' && typeof url !== 'string') return;
  const newTabId = createTab(typeof url === 'string' ? url : HOME_PAGE_URL);
  switchToTab(newTabId);
});

ipcMain.on('tab-switch', (event, tabId) => {
  if (!isTrustedIpcSender(event)) return;
  if (!Number.isInteger(tabId)) return;
  switchToTab(tabId);
});

ipcMain.on('tab-close', (event, tabId) => {
  if (!isTrustedIpcSender(event)) return;
  if (!Number.isInteger(tabId)) return;
  if (!tabs.has(tabId)) return;

  const ids = Array.from(tabs.keys());
  const closedIndex = ids.indexOf(tabId);
  const wasActive = activeTabId === tabId;

  destroyTab(tabId);

  if (tabs.size === 0) {
    const newId = createTab(HOME_PAGE_URL);
    switchToTab(newId);
    return;
  }

  if (wasActive) {
    const remainingIds = Array.from(tabs.keys());
    const nextIndex = Math.min(closedIndex, remainingIds.length - 1);
    switchToTab(remainingIds[nextIndex]);
    return;
  }

  emitTabsState();
});

ipcMain.on('toggle-sidebar', (event, open) => {
  if (!isTrustedIpcSender(event) || typeof open !== 'boolean') return;
  sidebarOpen = open;
  updateBounds();
});

ipcMain.on('settings-panel-visibility', (event, open) => {
  if (!isTrustedIpcSender(event) || typeof open !== 'boolean') return;
  settingsPanelOpen = open;
  updateBounds();
});

ipcMain.on('layout-metrics', (event, metrics) => {
  if (!isTrustedIpcSender(event)) return;
  if (!metrics || typeof metrics !== 'object') return;
  const x = Math.round(metrics.x);
  const y = Math.round(metrics.y);
  const width = Math.round(metrics.width);
  const height = Math.round(metrics.height);
  if (![x, y, width, height].every(Number.isFinite)) return;
  layoutMetrics = {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
  updateBounds();
});

ipcMain.on('window-minimize', (event) => {
  if (!isTrustedIpcSender(event)) return;
  mainWindow.minimize();
});
ipcMain.on('window-maximize', (event) => {
  if (!isTrustedIpcSender(event)) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', (event) => {
  if (!isTrustedIpcSender(event)) return;
  mainWindow.close();
});

ipcMain.handle('store-get', (event, key) => {
  if (!isTrustedIpcSender(event)) throw new Error('Unauthorized IPC sender');
  if (typeof key !== 'string' || !key || key.length > MAX_STORE_KEY_LENGTH) {
    throw new Error('Invalid store key');
  }
  return store.get(key);
});
ipcMain.handle('store-set', (event, key, value) => {
  if (!isTrustedIpcSender(event)) throw new Error('Unauthorized IPC sender');
  if (typeof key !== 'string' || !key || key.length > MAX_STORE_KEY_LENGTH) {
    throw new Error('Invalid store key');
  }
  store.set(key, value);
  return true;
});
ipcMain.handle('log-error', (event, payload) => {
  if (!isTrustedIpcSender(event)) throw new Error('Unauthorized IPC sender');
  if (!payload || typeof payload.source !== 'string' || typeof payload.message !== 'string') {
    throw new Error('Invalid error payload');
  }
  logError(`renderer-${payload.source}`, payload.message);
  return true;
});

ipcMain.handle('settings-get-state', (event) => {
  if (!isTrustedIpcSender(event)) throw new Error('Unauthorized IPC sender');
  return featureStore.getPublicSnapshot();
});

ipcMain.handle('settings-set-feature-enabled', (event, featureId, enabled) => {
  if (!isTrustedIpcSender(event)) throw new Error('Unauthorized IPC sender');
  if (typeof featureId !== 'string' || featureId.length > 128 || typeof enabled !== 'boolean') {
    throw new Error('Invalid settings payload');
  }
  const ok = featureStore.setFeatureEnabled(featureId, enabled);
  if (!ok) throw new Error('Unknown feature');
  emitSettingsState();
  return true;
});

ipcMain.handle('settings-update-feature-config', (event, featureId, patch) => {
  if (!isTrustedIpcSender(event)) throw new Error('Unauthorized IPC sender');
  if (typeof featureId !== 'string' || featureId.length > 128 || !patch || typeof patch !== 'object') {
    throw new Error('Invalid settings payload');
  }
  const ok = featureStore.updateFeatureConfig(featureId, patch);
  if (!ok) throw new Error('Unknown feature');
  emitSettingsState();
  return true;
});

ipcMain.handle('settings-reset-feature', (event, featureId) => {
  if (!isTrustedIpcSender(event)) throw new Error('Unauthorized IPC sender');
  if (typeof featureId !== 'string' || featureId.length > 128) throw new Error('Invalid feature id');
  const ok = featureStore.resetFeature(featureId);
  if (!ok) throw new Error('Unknown feature');
  emitSettingsState();
  return true;
});

ipcMain.handle('settings-reset-all', (event) => {
  if (!isTrustedIpcSender(event)) throw new Error('Unauthorized IPC sender');
  featureStore.resetAll();
  emitSettingsState();
  return true;
});

ipcMain.handle('settings-export', (event) => {
  if (!isTrustedIpcSender(event)) throw new Error('Unauthorized IPC sender');
  return featureStore.exportJson();
});

ipcMain.handle('settings-import', (event, jsonText) => {
  if (!isTrustedIpcSender(event)) throw new Error('Unauthorized IPC sender');
  if (typeof jsonText !== 'string' || jsonText.length > MAX_SETTINGS_PAYLOAD_LENGTH) {
    throw new Error('Invalid settings import payload');
  }
  const ok = featureStore.importJson(jsonText);
  if (!ok) throw new Error('Invalid settings JSON');
  emitSettingsState();
  return true;
});

app.whenReady().then(() => {
  initializeLogging();
  process.on('uncaughtException', (err) => logError('main-uncaughtException', err));
  process.on('unhandledRejection', (reason) => logError('main-unhandledRejection', reason));

  const sess = session.fromPartition('persist:browser');

  sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const targetUrl = details.url;
    if (shouldBlockByAdFilter(targetUrl) || isSiteBlocked(targetUrl)) {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked');
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });

  createWindow();
  emitSettingsState();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

const { contextBridge, ipcRenderer } = require('electron');

const SEND_CHANNELS = new Set([
  'navigate',
  'go-back',
  'go-forward',
  'reload',
  'tab-create',
  'tab-switch',
  'tab-close',
  'toggle-sidebar',
  'settings-panel-visibility',
  'layout-metrics',
  'window-minimize',
  'window-maximize',
  'window-close',
]);

const INVOKE_CHANNELS = new Set([
  'store-get',
  'store-set',
  'log-error',
  'settings-get-state',
  'settings-set-feature-enabled',
  'settings-update-feature-config',
  'settings-reset-feature',
  'settings-reset-all',
  'settings-export',
  'settings-import',
]);
const RECEIVE_CHANNELS = new Set([
  'url-changed',
  'title-changed',
  'loading',
  'blocked',
  'tabs-state',
  'navigation-invalid',
  'settings-updated',
]);

function send(channel, payload) {
  if (!SEND_CHANNELS.has(channel)) throw new Error(`Blocked IPC channel: ${channel}`);
  ipcRenderer.send(channel, payload);
}

function invoke(channel, ...args) {
  if (!INVOKE_CHANNELS.has(channel)) throw new Error(`Blocked IPC channel: ${channel}`);
  return ipcRenderer.invoke(channel, ...args);
}

function on(channel, callback) {
  if (!RECEIVE_CHANNELS.has(channel)) throw new Error(`Blocked IPC channel: ${channel}`);
  if (typeof callback !== 'function') throw new Error('IPC callback must be a function');
  const listener = (_, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  navigate: (url) => send('navigate', url),
  goBack: () => send('go-back'),
  goForward: () => send('go-forward'),
  reload: () => send('reload'),
  createTab: (url) => send('tab-create', url),
  switchTab: (tabId) => send('tab-switch', tabId),
  closeTab: (tabId) => send('tab-close', tabId),
  toggleSidebar: (open) => send('toggle-sidebar', open),
  setSettingsPanelVisibility: (open) => send('settings-panel-visibility', open),
  updateLayoutMetrics: (metrics) => send('layout-metrics', metrics),
  windowMinimize: () => send('window-minimize'),
  windowMaximize: () => send('window-maximize'),
  windowClose: () => send('window-close'),
  storeGet: (key) => invoke('store-get', key),
  storeSet: (key, val) => invoke('store-set', key, val),
  logError: (source, message) => invoke('log-error', { source, message }),
  onUrlChanged: (cb) => on('url-changed', cb),
  onTitleChanged: (cb) => on('title-changed', cb),
  onLoading: (cb) => on('loading', cb),
  onBlocked: (cb) => on('blocked', cb),
  onTabsState: (cb) => on('tabs-state', cb),
  onNavigationInvalid: (cb) => on('navigation-invalid', cb),
  getSettingsState: () => invoke('settings-get-state'),
  enableFeature: (featureId) => invoke('settings-set-feature-enabled', featureId, true),
  disableFeature: (featureId) => invoke('settings-set-feature-enabled', featureId, false),
  setFeatureEnabled: (featureId, enabled) => invoke('settings-set-feature-enabled', featureId, enabled),
  updateFeatureConfig: (featureId, patch) => invoke('settings-update-feature-config', featureId, patch),
  resetFeature: (featureId) => invoke('settings-reset-feature', featureId),
  resetAllSettings: () => invoke('settings-reset-all'),
  exportSettings: () => invoke('settings-export'),
  importSettings: (jsonText) => invoke('settings-import', jsonText),
  onSettingsUpdated: (cb) => on('settings-updated', cb),
};

contextBridge.exposeInMainWorld('orion', Object.freeze(api));

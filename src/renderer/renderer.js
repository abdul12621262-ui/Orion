// ============================================================
//  ORION RENDERER — v2.0
//  Entry point. Wires IPC, UI, AI, Settings, layout metrics.
// ============================================================

import { createTabStateStore } from './state.js';
import { createUiController }  from './ui.js';
import { initAiPanel }         from './ai.js';
import { initSettingsPanel }   from './settings.js';

const { orion } = window;

// ── INIT ─────────────────────────────────────────────────────
const tabStore = createTabStateStore();
const ui       = createUiController(orion, tabStore);
const ai       = initAiPanel(orion);
const settings = initSettingsPanel(orion);

// ── ERROR CAPTURE ─────────────────────────────────────────────
window.addEventListener('error', (event) => {
  const msg = event.error?.stack || event.message || 'Unknown renderer error';
  orion.logError('window-error', msg).catch(() => {});
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.stack || event.reason?.message || String(event.reason ?? 'Unhandled rejection');
  orion.logError('unhandled-rejection', reason).catch(() => {});
});

// ── IPC BINDINGS ──────────────────────────────────────────────
orion.onTabsState((payload)  => ui.onTabsState(payload));
orion.onUrlChanged((url)     => ui.onUrlChanged(url));
orion.onTitleChanged((title) => ui.onTitleChanged(title));
orion.onLoading((loading)    => ui.onLoading(loading));
orion.onBlocked(()           => ui.onBlocked());
orion.onNavigationInvalid(() => ui.onNavigationInvalid());
orion.onSettingsUpdated((snapshot) => settings.applySettings(snapshot));

// ── WINDOW CONTROLS ───────────────────────────────────────────
document.getElementById('btn-min')  .addEventListener('click', () => orion.windowMinimize());
document.getElementById('btn-max')  .addEventListener('click', () => orion.windowMaximize());
document.getElementById('btn-close').addEventListener('click', () => orion.windowClose());

// ── AI PANEL TOGGLE ───────────────────────────────────────────
const btnToggleAi = document.getElementById('btn-toggle-ai');
const aiPanel     = document.getElementById('ai-panel');

btnToggleAi.addEventListener('click', () => {
  const hidden = aiPanel.classList.toggle('hidden');
  btnToggleAi.classList.toggle('active', !hidden);
  // Recompute layout so webview repositions
  setTimeout(publishLayoutMetrics, 320); // wait for CSS transition
});

const btnCloseAi = document.getElementById('btn-close-ai');
btnCloseAi.addEventListener('click', () => {
  aiPanel.classList.add('hidden');
  btnToggleAi.classList.remove('active');
  setTimeout(publishLayoutMetrics, 320);
});

// ── LAYOUT METRICS ────────────────────────────────────────────
const centerCol  = document.getElementById('center-col');
const statusStrip = document.getElementById('status-strip');

function publishLayoutMetrics() {
  if (!centerCol || !statusStrip) return;
  const centerRect = centerCol.getBoundingClientRect();
  const statusRect  = statusStrip.getBoundingClientRect();
  const y      = Math.round(statusRect.bottom);
  const x      = Math.round(centerRect.left);
  const width  = Math.round(centerRect.width);
  const height = Math.round(Math.max(1, window.innerHeight - y));
  orion.updateLayoutMetrics({ x, y, width, height });
}

window.addEventListener('resize', publishLayoutMetrics);
new ResizeObserver(publishLayoutMetrics).observe(centerCol);

// ── STARTUP ───────────────────────────────────────────────────
ui.bindEvents();
ai.bindEvents();
settings.bindEvents();

settings.bootstrapState().catch((err) => {
  orion.logError('settings-bootstrap', err?.stack || err?.message || String(err)).catch(() => {});
});

publishLayoutMetrics();
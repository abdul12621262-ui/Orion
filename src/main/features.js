const FEATURE_REGISTRY = [
  {
    id: 'adBlocker',
    name: 'Ad Blocker',
    category: 'privacy',
    defaultEnabled: true,
    settings: {
      blockTrackers: true,
      blockAds: true,
      customBlocklists: [],
    },
  },
  {
    id: 'siteBlocker',
    name: 'Site Blocker',
    category: 'security',
    defaultEnabled: false,
    settings: {
      blockedSites: [],
      allowOverrides: true,
      schedules: [],
    },
  },
  {
    id: 'themeSystem',
    name: 'Theme System',
    category: 'appearance',
    defaultEnabled: true,
    settings: {
      mode: 'dark',
      compactMode: false,
    },
  },
  {
    id: 'performanceOptimizer',
    name: 'Performance Optimizer',
    category: 'performance',
    defaultEnabled: true,
    settings: {
      discardInactiveTabs: false,
      maxBackgroundTabs: 10,
    },
  },
  {
    id: 'downloadManager',
    name: 'Download Manager',
    category: 'advanced',
    defaultEnabled: true,
    settings: {
      askEveryDownload: true,
      defaultPath: '',
    },
  },
  {
    id: 'tabBehavior',
    name: 'Tab Behavior',
    category: 'performance',
    defaultEnabled: true,
    settings: {
      confirmOnCloseMultiple: false,
      restoreOnStartup: true,
    },
  },
  {
    id: 'securityProtections',
    name: 'Security Protections',
    category: 'security',
    defaultEnabled: true,
    settings: {
      httpsOnlyMode: false,
      blockInsecureContent: true,
    },
  },
  {
    id: 'developerTools',
    name: 'Developer Tools',
    category: 'advanced',
    defaultEnabled: false,
    settings: {
      allowDevtools: false,
    },
  },
];

const AD_BLOCK_PATTERNS = [
  '*://*.doubleclick.net/*',
  '*://*.googlesyndication.com/*',
  '*://*.googletagmanager.com/*',
  '*://*.google-analytics.com/*',
  '*://*.googletagservices.com/*',
  '*://*.adnxs.com/*',
  '*://*.advertising.com/*',
  '*://*.moatads.com/*',
  '*://*.scorecardresearch.com/*',
  '*://*.quantserve.com/*',
  '*://*.adsrvr.org/*',
  '*://*.pubmatic.com/*',
  '*://*.rubiconproject.com/*',
  '*://*.openx.net/*',
  '*://*.criteo.com/*',
  '*://*.outbrain.com/*',
  '*://*.taboola.com/*',
  '*://*.amazon-adsystem.com/*',
  '*://*.facebook.com/tr*',
  '*://*.hotjar.com/*',
  '*://*.mixpanel.com/*',
  '*://*.segment.com/*',
  '*://*.amplitude.com/*',
  '*://*.chartbeat.com/*',
  '*://*.addthis.com/*',
  '*://*.sharethis.com/*',
];

function cloneRegistry() {
  return FEATURE_REGISTRY.map((feature) => ({
    ...feature,
    settings: JSON.parse(JSON.stringify(feature.settings)),
  }));
}

function getDefaultFeatureState() {
  const result = {};
  for (const feature of FEATURE_REGISTRY) {
    result[feature.id] = {
      enabled: feature.defaultEnabled,
      settings: JSON.parse(JSON.stringify(feature.settings)),
    };
  }
  return result;
}

module.exports = {
  FEATURE_REGISTRY,
  AD_BLOCK_PATTERNS,
  cloneRegistry,
  getDefaultFeatureState,
};

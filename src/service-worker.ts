import {
  decodeBookmarklet,
  executeBookmarklet,
  disableCspForTab,
  isScriptableUrl,
  getBookmarkletForCommand,
  getToolbarBookmarklet,
  loadConfig,
  type AppConfig,
} from './lib/bookmarklet-utils.js';
import { log, warn, error, setDebugEnabled } from './lib/debug-log.js';

// ---------------------------------------------------------------------------
// Initialise debug logging from stored config
// ---------------------------------------------------------------------------

(async () => {
  const config = await loadConfig();
  setDebugEnabled(config.debugEnabled);
})();

// Keep the debug flag in sync when the user saves options.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.appConfig) {
    const newConfig = changes.appConfig.newValue as AppConfig | undefined;
    if (newConfig) {
      setDebugEnabled(newConfig.debugEnabled ?? false);
    }
  }
});

// ---------------------------------------------------------------------------
// Top-level event listeners (registered synchronously — MV3 requirement)
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener((tab) => {
  handleToolbarClick(tab);
});

chrome.commands.onCommand.addListener((command, tab) => {
  handleCommand(command, tab);
});

// ---------------------------------------------------------------------------
// Toolbar button click handler
// ---------------------------------------------------------------------------

async function handleToolbarClick(tab: chrome.tabs.Tab): Promise<void> {
  log('Toolbar button clicked', { tabId: tab.id, url: tab.url });

  const tabId = tab.id;
  if (tabId === undefined) {
    warn('Toolbar click: no tab ID available');
    return;
  }

  if (!isScriptableUrl(tab.url)) {
    warn(
      `Cannot inject on "${tab.url}". Only http:// and https:// pages are supported.`,
    );
    return;
  }

  const info = await getToolbarBookmarklet();
  if (!info) {
    log('No toolbar bookmarklet configured — opening options page');
    chrome.runtime.openOptionsPage();
    return;
  }

  log('Running toolbar bookmarklet', {
    url: info.url,
    disableCsp: info.disableCsp,
  });
  await runBookmarklet(tabId, info.url, info.disableCsp);
}

// ---------------------------------------------------------------------------
// Keyboard shortcut handler
// ---------------------------------------------------------------------------

async function handleCommand(
  command: string,
  tab: chrome.tabs.Tab,
): Promise<void> {
  log('Keyboard shortcut fired', { command, tabId: tab.id, url: tab.url });

  const tabId = tab.id;
  if (tabId === undefined) {
    warn('Command handler: no tab ID available');
    return;
  }

  if (!isScriptableUrl(tab.url)) {
    warn(
      `Cannot inject on "${tab.url}". Only http:// and https:// pages are supported.`,
    );
    return;
  }

  const info = await getBookmarkletForCommand(command);
  if (!info) {
    log(
      `Shortcut "${command}" not configured — opening options page`,
    );
    chrome.runtime.openOptionsPage();
    return;
  }

  log(`Running bookmarklet for command "${command}"`, {
    url: info.url,
    disableCsp: info.disableCsp,
  });
  await runBookmarklet(tabId, info.url, info.disableCsp);
}

// ---------------------------------------------------------------------------
// Core execution
// ---------------------------------------------------------------------------

async function runBookmarklet(
  tabId: number,
  rawUrl: string,
  disableCsp: boolean,
): Promise<void> {
  log('runBookmarklet', { tabId, disableCsp });

  try {
    if (disableCsp) {
      log('Disabling CSP for tab', { tabId });
      await disableCspForTab(tabId);
    }

    const code = decodeBookmarklet(rawUrl);
    log('Injecting bookmarklet into tab', { tabId, codeLength: code.length });
    await executeBookmarklet(tabId, code);
    log('Bookmarklet executed successfully', { tabId });
  } catch (err) {
    error('Failed to execute bookmarklet', err);
  }
}

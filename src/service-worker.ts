import {
  decodeBookmarklet,
  executeBookmarklet,
  disableCspForTab,
  isScriptableUrl,
  getBookmarkletForCommand,
  getToolbarBookmarklet,
  truncateTitle,
  loadConfig,
  type AppConfig,
} from './lib/bookmarklet-utils.js';
import { log, warn, error, setDebugEnabled } from './lib/debug-log.js';
import { drawLetter } from './lib/icon-canvas.js';

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

/** Icon sizes generated for the toolbar action (covers 1×, 2×, and extensions page). */
const TOOLBAR_ICON_SIZES = [16, 48, 128];

async function updateToolbar(config?: AppConfig): Promise<void> {
  const info = await getToolbarBookmarklet(config);
  if (info) {
    const title = `Run "${truncateTitle(info.name)}"`;
    chrome.action.setTitle({ title });

    // Dynamically render an icon from the first letter of the bookmarklet title.
    const letter = info.name.trim().charAt(0).toUpperCase() || 'B';
    const imageData: Record<number, ImageData> = {};
    for (const size of TOOLBAR_ICON_SIZES) {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d')!;
      drawLetter(letter, { canvas, ctx });
      imageData[size] = ctx.getImageData(0, 0, size, size);
    }
    chrome.action.setIcon({ imageData });
  } else {
    chrome.action.setTitle({ title: 'Bookmarklet Runner (no bookmarklet configured)' });
    // Reset to the static icons declared in the manifest.
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon-16.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Initialise from stored config
// ---------------------------------------------------------------------------

(async () => {
  const config = await loadConfig();
  setDebugEnabled(config.debugEnabled);
  updateToolbar(config);
})();

// Keep debug flag and toolbar title in sync when the user saves options.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.appConfig) {
    const newConfig = changes.appConfig.newValue as AppConfig | undefined;
    if (newConfig) {
      setDebugEnabled(newConfig.debugEnabled ?? false);
      updateToolbar(newConfig);
    }
  }
});

// ---------------------------------------------------------------------------
// Top-level event listeners (registered synchronously — MV3 requirement)
// ---------------------------------------------------------------------------

// Wake the service worker on browser startup so the dynamic toolbar icon
// is restored immediately instead of showing the manifest default_icon until
// the user clicks the button for the first time.
chrome.runtime.onStartup.addListener(() => {
  updateToolbar();
});

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

  log(`Running toolbar bookmarklet "${info.name}"`, {
    url: info.url,
    disableCsp: info.disableCsp,
  });
  await runBookmarklet(tabId, info.name, info.url, info.disableCsp);
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

  log(`Running bookmarklet "${info.name}" for command "${command}"`, {
    url: info.url,
    disableCsp: info.disableCsp,
  });
  await runBookmarklet(tabId, info.name, info.url, info.disableCsp);
}

// ---------------------------------------------------------------------------
// Core execution
// ---------------------------------------------------------------------------

async function runBookmarklet(
  tabId: number,
  name: string,
  rawUrl: string,
  disableCsp: boolean,
): Promise<void> {
  log(`runBookmarklet "${name}"`, { tabId, disableCsp });

  try {
    if (disableCsp) {
      log(`Disabling CSP for tab`, { tabId });
      await disableCspForTab(tabId);
    }

    const code = decodeBookmarklet(rawUrl);
    log(`Injecting "${name}" into tab`, { tabId, codeLength: code.length });
    await executeBookmarklet(tabId, code);
    log(`"${name}" executed successfully`, { tabId });
  } catch (err) {
    error(`Failed to execute "${name}"`, err);
    // Try to show a visible alert so the user knows something went wrong.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (msg: string) => {
          alert(msg);
        },
        args: [
          `Bookmarklet Runner: Failed to run "${name}".\n\n${String(err)}`,
        ],
      });
    } catch {
      // Tab may have closed — nothing we can do.
    }
  }
}

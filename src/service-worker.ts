import {
  decodeBookmarklet,
  executeBookmarklet,
  disableCspForTab,
  isScriptableUrl,
  getBookmarkletForCommand,
  getToolbarBookmarklet,
} from './lib/bookmarklet-utils.js';

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
  const tabId = tab.id;
  if (tabId === undefined) return;

  if (!isScriptableUrl(tab.url)) {
    console.warn(
      `Bookmarklet Runner: Cannot inject on "${tab.url}". Only http:// and https:// pages are supported.`,
    );
    return;
  }

  const info = await getToolbarBookmarklet();
  if (!info) {
    // No toolbar bookmarklet configured — open options page
    chrome.runtime.openOptionsPage();
    return;
  }

  await runBookmarklet(tabId, info.url, info.disableCsp);
}

// ---------------------------------------------------------------------------
// Keyboard shortcut handler
// ---------------------------------------------------------------------------

async function handleCommand(
  command: string,
  tab: chrome.tabs.Tab,
): Promise<void> {
  const tabId = tab.id;
  if (tabId === undefined) return;

  if (!isScriptableUrl(tab.url)) {
    console.warn(
      `Bookmarklet Runner: Cannot inject on "${tab.url}". Only http:// and https:// pages are supported.`,
    );
    return;
  }

  const info = await getBookmarkletForCommand(command);
  if (!info) {
    // Shortcut not configured or bookmarklet deleted — open options page
    chrome.runtime.openOptionsPage();
    return;
  }

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
  try {
    if (disableCsp) {
      await disableCspForTab(tabId);
    }

    const code = decodeBookmarklet(rawUrl);
    await executeBookmarklet(tabId, code);
  } catch (err) {
    // The most likely error is that the user clicked on a restricted page
    // (chrome://, etc.) before the isScriptableUrl check could prevent it.
    console.error('Bookmarklet Runner: Failed to execute bookmarklet', err);
  }
}

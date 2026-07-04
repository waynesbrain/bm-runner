// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface BookmarkletInfo {
  id: string;
  title: string;
  url: string;
}

export interface AppConfig {
  /** Bookmarklet ID to run on toolbar click (null = none configured) */
  toolbarBookmarklet: string | null;
  /** command-name → bookmarklet ID (null = unassigned slot) */
  shortcutBookmarklets: Record<string, string | null>;
  /** bookmarklet ID → whether to strip CSP before injection */
  cspDisabled: Record<string, boolean>;
  /** Whether debug-level console logging is enabled */
  debugEnabled: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  toolbarBookmarklet: null,
  shortcutBookmarklets: {
    'run-bookmarklet-1': null,
    'run-bookmarklet-2': null,
    'run-bookmarklet-3': null,
  },
  cspDisabled: {},
  debugEnabled: false,
};

// ---------------------------------------------------------------------------
// Bookmarklet detection
// ---------------------------------------------------------------------------

interface BookmarkTreeNode {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkTreeNode[];
}

function walkTree(nodes: BookmarkTreeNode[], results: BookmarkletInfo[]): void {
  for (const node of nodes) {
    if (node.url !== undefined) {
      // It's a bookmark (not a folder)
      if (isBookmarklet(node.url)) {
        results.push({ id: node.id, title: node.title, url: node.url });
      }
    }
    if (node.children) {
      walkTree(node.children, results);
    }
  }
}

/**
 * Returns true if the URL is a javascript: bookmarklet (not just void(0)
 * or an empty JS URL).
 */
function isBookmarklet(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.startsWith('javascript:')) return false;
  // Filter out common non-bookmarklet JS URLs
  const body = trimmed.slice('javascript:'.length).trim();
  if (!body || body === 'void(0)' || body === 'void(0);') return false;
  return true;
}

export async function getAllBookmarklets(): Promise<BookmarkletInfo[]> {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => {
      const results: BookmarkletInfo[] = [];
      if (tree && tree.length > 0 && tree[0]?.children) {
        walkTree(tree[0].children, results);
      }
      resolve(results);
    });
  });
}

// ---------------------------------------------------------------------------
// Bookmarklet URL decoding
// ---------------------------------------------------------------------------

export function decodeBookmarklet(url: string): string {
  const trimmed = url.trim();
  const jsPrefix = 'javascript:';
  if (trimmed.startsWith(jsPrefix)) {
    const encoded = trimmed.slice(jsPrefix.length);
    try {
      return decodeURIComponent(encoded);
    } catch {
      // If decodeURIComponent fails (malformed % sequences), return as-is
      return encoded;
    }
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Bookmarklet execution
// ---------------------------------------------------------------------------

const CSP_RULE_ID = 1;

/**
 * Add a declarativeNetRequest session rule to strip CSP headers for `tabId`.
 * Idempotent — safe to call multiple times for the same tab.
 */
export async function disableCspForTab(tabId: number): Promise<void> {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [CSP_RULE_ID],
    addRules: [
      {
        id: CSP_RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          responseHeaders: [
            {
              header: 'content-security-policy',
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
            },
          ],
        },
        condition: {
          tabIds: [tabId],
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
            chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
          ],
        },
      },
    ],
  });
}

/**
 * Remove the per-tab CSP-stripping rule.
 */
export async function enableCspForTab(tabId: number): Promise<void> {
  // Since we only have one rule at ID 1, just remove it unconditionally.
  // We don't track per-tab state for this — the next call to disableCspForTab
  // for any tab will re-add it with the new tab's ID.
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [CSP_RULE_ID],
  });
}

/**
 * Inject a decoded bookmarklet script into a tab's MAIN world. Creates a
 * <script> element to avoid CSP eval restrictions.
 */
export async function executeBookmarklet(
  tabId: number,
  code: string,
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (src: string) => {
      const script = document.createElement('script');
      script.textContent = src;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    },
    args: [code],
  });
}

// ---------------------------------------------------------------------------
// URL safety check
// ---------------------------------------------------------------------------

/**
 * Returns true if the URL's scheme allows script injection. Extensions
 * cannot inject into chrome://, chrome-extension://, edge://, etc.
 */
export function isScriptableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

const CONFIG_KEY = 'appConfig';

export async function loadConfig(): Promise<AppConfig> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(CONFIG_KEY, (data) => {
      const stored = data[CONFIG_KEY] as Partial<AppConfig> | undefined;
      // Deep-merge with defaults so new fields added in future versions
      // don't require a storage migration.
      resolve({
        toolbarBookmarklet:
          stored?.toolbarBookmarklet ?? DEFAULT_CONFIG.toolbarBookmarklet,
        shortcutBookmarklets: {
          ...DEFAULT_CONFIG.shortcutBookmarklets,
          ...stored?.shortcutBookmarklets,
        },
        cspDisabled: {
          ...stored?.cspDisabled,
        },
        debugEnabled: stored?.debugEnabled ?? DEFAULT_CONFIG.debugEnabled,
      });
    });
  });
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [CONFIG_KEY]: config }, () => resolve());
  });
}

/**
 * Given a command name (e.g. "run-bookmarklet-2"), return the assigned
 * bookmarklet URL, or null if none is configured.
 */
export async function getBookmarkletForCommand(
  command: string,
  config?: AppConfig,
): Promise<{ url: string; disableCsp: boolean } | null> {
  const cfg = config ?? (await loadConfig());
  const bookmarkletId = cfg.shortcutBookmarklets[command] ?? null;
  if (!bookmarkletId) return null;

  // Look up the actual URL from the bookmark tree
  const bookmarklets = await getAllBookmarklets();
  const match = bookmarklets.find((b) => b.id === bookmarkletId);
  if (!match) return null; // bookmarklet was deleted

  return {
    url: match.url,
    disableCsp: cfg.cspDisabled[bookmarkletId] ?? false,
  };
}

/**
 * Given the config, return the toolbar bookmarklet info or null.
 */
export async function getToolbarBookmarklet(
  config?: AppConfig,
): Promise<{ url: string; disableCsp: boolean } | null> {
  const cfg = config ?? (await loadConfig());
  if (!cfg.toolbarBookmarklet) return null;

  const bookmarklets = await getAllBookmarklets();
  const match = bookmarklets.find((b) => b.id === cfg.toolbarBookmarklet);
  if (!match) return null;

  return {
    url: match.url,
    disableCsp: cfg.cspDisabled[cfg.toolbarBookmarklet] ?? false,
  };
}

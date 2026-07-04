// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface BookmarkletInfo {
  id: string;
  title: string;
  url: string;
  /** Folder path from the bookmarks root, e.g. "/b/" or "[Other bookmarks]/b/" */
  path: string;
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
    "run-bookmarklet-1": null,
    "run-bookmarklet-2": null,
    "run-bookmarklet-3": null,
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

function walkTree(
  nodes: BookmarkTreeNode[],
  results: BookmarkletInfo[],
  path: string,
): void {
  for (const node of nodes) {
    if (node.url !== undefined) {
      // It's a bookmark (not a folder)
      if (isBookmarklet(node.url)) {
        results.push({ id: node.id, title: node.title, url: node.url, path });
      }
    }
    if (node.children) {
      walkTree(node.children, results, `${path}${node.title}/`);
    }
  }
}

/**
 * Build the root path segment from the top-level bookmark folder name.
 * "Bookmarks bar" becomes the implicit root ("/"), "Other bookmarks"
 * and anything else gets bracketed.
 */
function rootPath(folderName: string): string {
  if (folderName === "Bookmarks bar") return "/";
  return `[${folderName}]/`;
}

/**
 * Returns true if the URL is a javascript: bookmarklet (not just void(0)
 * or an empty JS URL).
 */
function isBookmarklet(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.startsWith("javascript:")) return false;
  // Filter out common non-bookmarklet JS URLs
  const body = trimmed.slice("javascript:".length).trim();
  if (!body || body === "void(0)" || body === "void(0);") return false;
  return true;
}

export async function getAllBookmarklets(): Promise<BookmarkletInfo[]> {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => {
      const results: BookmarkletInfo[] = [];
      if (tree && tree.length > 0 && tree[0]?.children) {
        for (const rootFolder of tree[0].children) {
          if (rootFolder.children) {
            walkTree(rootFolder.children, results, rootPath(rootFolder.title));
          }
        }
      }
      resolve(results);
    });
  });
}

// ---------------------------------------------------------------------------
// Bookmarklet URL decoding
// ---------------------------------------------------------------------------

/**
 * Leniently decode a bookmarklet URL.  Only valid %XX hex-pair sequences are
 * decoded; malformed sequences (e.g. `%}` inside CSS rules like `width:100%}`)
 * are left untouched.  This matches how browsers decode javascript: URLs when
 * a bookmarklet is clicked natively.
 */
export function decodeBookmarklet(url: string): string {
  const trimmed = url.trim();
  const jsPrefix = "javascript:";
  if (trimmed.startsWith(jsPrefix)) {
    const encoded = trimmed.slice(jsPrefix.length);
    return encoded.replace(/%([0-9A-Fa-f]{2})/g, (_match, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_TITLE_LENGTH = 35;

/** Truncate a bookmarklet title for display in the toolbar tooltip. */
export function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) return title;
  return title.slice(0, MAX_TITLE_LENGTH - 1) + "…";
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
              header: "content-security-policy",
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
    world: "MAIN",
    func: (src: string) => {
      const script = document.createElement("script");
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
  return url.startsWith("http://") || url.startsWith("https://");
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

const CONFIG_KEY = "appConfig";

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

export interface BookmarkletAssignment {
  name: string;
  url: string;
  disableCsp: boolean;
}

/**
 * Given a command name (e.g. "run-bookmarklet-2"), return the assigned
 * bookmarklet, or null if none is configured.
 */
export async function getBookmarkletForCommand(
  command: string,
  config?: AppConfig,
): Promise<BookmarkletAssignment | null> {
  const cfg = config ?? (await loadConfig());
  const bookmarkletId = cfg.shortcutBookmarklets[command] ?? null;
  if (!bookmarkletId) return null;

  // Look up the actual URL from the bookmark tree
  const bookmarklets = await getAllBookmarklets();
  const match = bookmarklets.find((b) => b.id === bookmarkletId);
  if (!match) return null; // bookmarklet was deleted

  return {
    name: match.title,
    url: match.url,
    disableCsp: cfg.cspDisabled[bookmarkletId] ?? false,
  };
}

/**
 * Given the config, return the toolbar bookmarklet info or null.
 */
export async function getToolbarBookmarklet(
  config?: AppConfig,
): Promise<BookmarkletAssignment | null> {
  const cfg = config ?? (await loadConfig());
  if (!cfg.toolbarBookmarklet) return null;

  const bookmarklets = await getAllBookmarklets();
  const match = bookmarklets.find((b) => b.id === cfg.toolbarBookmarklet);
  if (!match) return null;

  return {
    name: match.title,
    url: match.url,
    disableCsp: cfg.cspDisabled[cfg.toolbarBookmarklet] ?? false,
  };
}

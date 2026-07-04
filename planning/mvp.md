# Minimum Viable Product — Implementation Plan

## Overview

"Bookmarklet Runner" is a Chrome extension that lets you run bookmarklets via a
toolbar button and configurable keyboard shortcuts. It scans the user's
bookmarks for `javascript:` URLs, lets the user pick one for the toolbar button
and others for keyboard shortcuts, and executes them in the current page.

The reference codebase (`chrome-bookmarklet-manager`) is a *bookmarklet editor*
built ~2018 on Manifest V2 with Vue 2 and Monaco. We are building a *bookmarklet
runner* on Manifest V3 — different purpose, different architecture.

**MVP distribution:** Developer install only (load unpacked from `ext/`).
Release planning (Chrome Web Store, packaging, versioning) will be in a separate
document. The README will include step-by-step developer installation
instructions.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Manifest V3                                     │
│                                                  │
│  ┌─────────────┐  ┌──────────────────┐           │
│  │ Service      │  │  Options Page     │           │
│  │ Worker       │  │  (options.html)   │           │
│  │              │  │                   │           │
│  │ - action.on- │  │  - Toolbar picker │           │
│  │   Clicked    │  │  - Shortcut#1-4   │           │
│  │ - commands.  │  │    pickers        │           │
│  │   onCommand  │  │  - Save to        │           │
│  │ - Inject     │  │    chrome.storage  │           │
│  │   bookmarklet│  │                   │           │
│  └──────┬───────┘  └──────────────────┘           │
│         │                                         │
│  ┌──────▼───────┐                                 │
│  │ chrome.storage│  ← sync (settings)              │
│  └──────────────┘                                 │
│  ┌──────────────┐                                 │
│  │ chrome.book-  │  ← read-only (detect           │
│  │   marks       │     bookmarklets)              │
│  └──────────────┘                                 │
└──────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **TypeScript everywhere.** The service worker, options page, and shared
   library are all written in TypeScript. Better tooling, fewer runtime
   surprises, and `chrome` API types via `@types/chrome`. Compiled to ES2020
   for the service worker (which runs in Chrome's V8 directly) and bundled
   for the options page.

2. **Lightweight options page — vanilla TS, no framework.** The UI is two
   `<select>` groups and a save button. No React/Preact/Vue needed. Plain
   DOM APIs from TypeScript keep the extension small and fast to review.

3. **Simple build step.** `tsc` compiles the service worker and shared lib
   (separate compilation units that don't share a bundle — the service worker
   is its own file). The options page uses a lightweight bundler (esbuild)
   to combine the shared lib + options page TS into one script tag. No
   Webpack, no vue-cli.

4. **Read-only bookmark access.** We never mutate bookmarks. The reference
   extension edited them, which adds complexity we don't need.

---

## Technical Challenges

### 1. Manifest V3 (the reference is V2)

Everything the reference does must be re-thought for MV3:

| Concern | MV2 (reference) | MV3 (ours) |
|---|---|---|
| Background | Persistent background page | Ephemeral service worker |
| Toolbar button | `browser_action` | `action` |
| Script injection | `chrome.tabs.executeScript` | `chrome.scripting.executeScript` |
| Permissions | `tabs` | `scripting` + `activeTab` + `bookmarks` + `storage` + `declarativeNetRequest` |

**Risk:** The service worker can be terminated at any time. All state must live
in `chrome.storage` — nothing in global variables survives across wake-ups.
Event listeners must be registered synchronously at top level (not inside async
callbacks), or Chrome won't wake the worker for them.

**Mitigation:** We register `action.onClicked` and `commands.onCommand` at the
top level. On each event, we read config from `chrome.storage`, look up the
bookmarklet, and inject it. No global state.

### 2. Bookmarklet Execution in the Page Context

A bookmarklet is a `javascript:` URL. The JavaScript inside runs in the *page's*
context, with access to the page's DOM, variables, and globals.

**Why not `chrome.tabs.update({url: 'javascript:...'})`?** That's the closest
API to "clicking a bookmark" — it navigates the current tab to the `javascript:`
URL, just like the bookmarks bar does. Two problems:
1. As of Chrome 117 (Sept 2023), `javascript:` URLs are **blocked in all
   extension API methods** including `chrome.tabs.update`. [Source: Chrome
   Extensions blog, Oct 2023](https://developer.chrome.google.cn/blog/extension-news-october-2023?hl=en).
2. Navigating to a `javascript:` URL replaces the document with the expression's
   return value (unless the bookmarklet appends `void(0)`). Not all bookmarklets
   do this — `tabs.update` could blank the page by accident.

**Solution:** `chrome.scripting.executeScript` with `world: 'MAIN'`. MV3
supports running a function directly in the page's own JavaScript world. We
decode the bookmarklet URL (strip `javascript:` prefix, `decodeURIComponent`)
and pass the code as a string argument:

```ts
chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',
  func: (code: string) => {
    const script = document.createElement('script');
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  },
  args: [decodedBookmarkletJS],
});
```

The `<script>` element approach (rather than `eval()` or `new Function()`)
avoids being blocked by pages whose CSP restricts `eval` but allows inline
scripts — which is the common case.

**Risk:** Pages with strict CSP that also block inline scripts (e.g., with a
nonce/hash policy) may still block this. We can't control it — CSP restrictions
on extension-injected scripts are an inherent limitation, same as with native
bookmarklet clicks. We document this as a known limitation.

**Risk:** Some bookmarklets use `document.write()` or other APIs that only work
during document parsing. These are inherently timing-sensitive regardless of
injection method.

**Risk:** Pages with strict CSP (e.g., GitHub) may block inline scripts even
when injected from an extension via `world: 'MAIN'`. See §8 for the CSP disable
option that mitigates this.

### 3. Optional CSP Disable Per Bookmarklet

Some bookmarklets are blocked by the page's Content-Security-Policy — the
`<script>` injection we do from `world: 'MAIN'` can still be blocked by a
strict CSP that requires nonces or hashes. For users who don't care about the
security implications, we offer an option to strip CSP headers before running
a bookmarklet.

**Approach:** Use `chrome.declarativeNetRequest.updateSessionRules` (MV3,
no host permissions needed) to add a temporary rule that removes the
`content-security-policy` response header for the current tab. The rule is
scoped to the tab via the `tabIds` condition — it doesn't affect other tabs.

```ts
// Before injecting the bookmarklet:
await chrome.declarativeNetRequest.updateSessionRules({
  addRules: [{
    id: 1,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
      responseHeaders: [{
        header: 'content-security-policy',
        operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
      }],
    },
    condition: {
      tabIds: [tabId],
      resourceTypes: ['main_frame', 'sub_frame'],
    },
  }],
});
// ... inject bookmarklet via executeScript ...
// The rule can stay active for subsequent runs on this tab, or be removed.
```

**References:** [PhilGrayson/chrome-csp-disable](https://github.com/PhilGrayson/chrome-csp-disable)
(60K users, same approach), [lisonge/Disable-CSP](https://github.com/lisonge/Disable-CSP)
(also strips `x-webkit-csp`, `x-frame-options`, and `<meta>` CSP tags).

**Design for MVP:** Each bookmarklet assignment in the options page gets a
checkbox: "Disable CSP for this bookmarklet." When checked, the service worker
adds the declarativeNetRequest rule for the tab before injecting. The rule
persists for the tab's lifetime (until navigation or tab close) — subsequent
runs on the same tab skip the rule setup since it's already active.

**Additional permission needed:** `declarativeNetRequest` (no host permissions
required — the `tabIds` condition scopes it to the active tab).

**Risk:** This only strips the HTTP header CSP. Some pages also set CSP via
`<meta>` tags. The lisonge extension handles this via the `debugger` API +
devtools page, but that requires broad permissions (`debugger`, `<all_urls>`).
For the MVP we only strip HTTP header CSP. We document this limitation.

**Risk:** The rule operates on subsequent navigations/requests. If the page is
already loaded, the CSP header was already enforced and the rule won't
retroactively unblock already-blocked resources. The injected bookmarklet runs
in `world: 'MAIN'` which bypasses some CSP restrictions already — this toggle
is for the remaining cases.

**Risk:** The `tabIds` condition requires Chrome 101+. Current Chrome is 149,
Brave 1.91 is based on a recent Chromium, so this is fine.

### 4. Keyboard Shortcut Limits

Chrome's `commands` API allows at most **4 declared shortcuts** per extension.
You declare them in `manifest.json` with suggested key bindings (e.g.,
`Ctrl+Shift+1`), and users can remap them at `chrome://extensions/shortcuts`.

**Design for MVP:** We declare 4 command slots in the manifest:

```json
"commands": {
  "run-bookmarklet-1": { "suggested_key": { "default": "Ctrl+Shift+1" }, "description": "Run bookmarklet #1" },
  "run-bookmarklet-2": { "suggested_key": { "default": "Ctrl+Shift+2" }, "description": "Run bookmarklet #2" },
  "run-bookmarklet-3": { "suggested_key": { "default": "Ctrl+Shift+3" }, "description": "Run bookmarklet #3" },
  "run-bookmarklet-4": { "suggested_key": { "default": "Ctrl+Shift+4" }, "description": "Run bookmarklet #4" },
  "_execute_action": { "suggested_key": { "default": "Ctrl+Shift+B" } }
}
```

The `_execute_action` built-in command fires the toolbar button action without
clicking — giving us a bonus shortcut.

Each `run-bookmarklet-N` command maps to a user-configurable bookmarklet via the
options page. The mapping is stored in `chrome.storage`.

**Risk:** Users who want more than 4 keyboard shortcuts can't get them from a
single extension instance. The planning doc `words.md` hints at a workaround:
install multiple copies of the extension with different names/IDs. That's a
post-MVP concern.

**Risk:** Chrome allows web pages to override extension keyboard shortcuts by
default. Users must visit `chrome://extensions/shortcuts` and toggle
"Allow extensions to override the following shortcuts" (or the per-shortcut
equivalent). This isn't something we can control programmatically. The README
mentions offering this option "if Chrome supports it" — the answer is "yes, but
only the user can change it." Our options page should include a link to
`chrome://extensions/shortcuts` with instructions.

### 5. Bookmarklet Detection & Decoding

We need to walk the bookmark tree and find all nodes whose URL starts with
`javascript:`. The bookmark tree is a nested structure (folders contain
bookmarks and sub-folders).

**Decoding:** Bookmarklet URLs come in two flavors:
- `javascript:alert('hello')` — no encoding
- `javascript:alert(%27hello%27)` — percent-encoded

We must handle both. The reference's `JavascriptUrlParser` strips the
`javascript:` prefix then calls `decodeURIComponent()`. `decodeURIComponent`
is safe on unencoded text (it does nothing), so this works for both cases.

**Risk:** The bookmark tree can be large (thousands of bookmarks). `chrome.bookmarks.getTree` returns the whole tree in one call, which is fine — it's fast and local.

**Risk:** A `javascript:` URL might be `javascript:void(0)` or `javascript:""`,
which are not real bookmarklets. We can't distinguish these from real
bookmarklets automatically. The user sees them in the picker and can choose
which to use.

### 6. Service Worker Ephemerality

MV3 service workers don't stay alive. They wake, handle an event, and may be
terminated within ~30 seconds of idling.

**Mitigation strategies:**
- No global state — every handler reads config from `chrome.storage` fresh
- All async work is awaited before the handler returns
- No timers, no long-lived connections needed

This is actually simpler than it sounds for our use case — we just read config
and inject a script, both of which are fire-and-forget async operations.

### 7. `activeTab` Permission & Script Injection Timing

We use the `activeTab` permission (granted when the user clicks the toolbar
button or invokes a keyboard shortcut) to inject scripts. This avoids needing
broad host permissions (`<all_urls>`).

**Risk:** The `activeTab` permission is only active for the tab that was active
when the user triggered the extension. If we need to run on a different tab, we
can't. That's fine for this use case — bookmarklets run on the current page.

**Risk:** Chrome's internal pages (`chrome://`, `chrome-extension://`,
`edge://`) cannot be scripted, even with `activeTab`. We need to handle this
gracefully (check `tab.url`, show an error if the URL scheme isn't `http`/`https`).

### 8. Storage Sync vs Local

`chrome.storage.sync` syncs across the user's Chrome instances. It has a per-item
quota of 8 KB and a total of 100 KB. Our config is tiny (a few strings), so sync
is the right choice. If we hit limits post-MVP, we can split hot data to sync
and cold data to local.

## Data Model

```ts
interface BookmarkletInfo {
  id: string;       // Chrome bookmark ID
  title: string;    // bookmark title
  url: string;      // raw javascript:... URL
}

interface BookmarkletAssignment {
  bookmarkletId: string;    // which bookmarklet to run (maps to BookmarkletInfo.id)
  disableCsp: boolean;      // strip CSP headers before injecting
}

interface AppConfig {
  toolbarBookmarklet: string | null;              // BookmarkletInfo.id for toolbar click
  shortcutBookmarklets: Record<string, string | null>;  // "run-bookmarklet-N" → BookmarkletInfo.id
  cspDisabled: Record<string, boolean>;           // BookmarkletInfo.id → disableCsp flag
}
```

The `cspDisabled` map lets us look up whether CSP should be stripped for any
given bookmarklet assignment. The bookmarklet ID is the key — if the same
bookmarklet is assigned to both the toolbar and a shortcut, they share the
same CSP disable flag (which is the right behavior: a bookmarklet either needs
CSP bypass or it doesn't, regardless of how it's invoked).

---

## MVP Feature Set

1. **Toolbar button:** Click runs the user's chosen bookmarklet on the current
   tab's page.
2. **Keyboard shortcuts:** Up to 4 configurable shortcuts, each runs a
   user-chosen bookmarklet.
3. **Options page:** Two sections:
   - "Toolbar Bookmarklet" — dropdown to pick which bookmarklet runs on click
   - "Keyboard Bookmarklets" — up to 4 dropdowns to assign bookmarklets to
     shortcut slots
4. **Bookmarklet scanning:** On options page load, scans all bookmarks and
   populates dropdowns with detected bookmarklets.
5. **Optional CSP disable:** Per-bookmarklet checkbox to strip
   `content-security-policy` response headers before injection. Uses
   `declarativeNetRequest` session rules scoped to the current tab — no broad
   host permissions needed. Off by default.
6. **Graceful handling** of restricted pages (`chrome://`, etc.).
7. **Link** to `chrome://extensions/shortcuts` so users can customize key
   bindings and prevent page overrides.

## Out of Scope (post-MVP)

- Monaco editor or any bookmarklet editing
- Creating/deleting bookmarklets
- More than 4 keyboard shortcuts (multi-instance workaround deferred)
- Custom keyboard shortcut assignment from within the options page (delegated to
  Chrome's built-in UI)
- `<meta>` tag CSP removal (requires `debugger` API + `<all_urls>` — too
  invasive for MVP; HTTP header CSP removal covers most cases)
- Internationalization
- Publishing to Chrome Web Store or any packaged distribution (release planning
  will be in a separate document; MVP is developer-install only via "Load
  unpacked")

---

## File Structure

```
bm-runner/
├── ext/                          # Unpacked extension (load this in Chrome)
│   ├── manifest.json
│   ├── icons/
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   ├── service-worker.js         # Compiled from src/service-worker.ts
│   ├── lib/
│   │   └── bookmarklet-utils.js  # Compiled from src/lib/bookmarklet-utils.ts
│   └── options/
│       ├── options.html
│       ├── options.js            # Bundled from src/options/*.ts + src/lib/
│       └── options.css
├── src/                          # TypeScript source
│   ├── service-worker.ts         # Background service worker
│   ├── lib/
│   │   └── bookmarklet-utils.ts  # Shared: detection, decoding, injection
│   └── options/
│       ├── options.ts            # Options page logic
│       └── options.css           # (copied to ext/ as-is)
├── planning/                     # Design docs
│   ├── mvp.md
│   ├── references.md
│   └── words.md
├── tsconfig.json                 # TypeScript config
├── package.json                  # devDeps: typescript, @types/chrome, esbuild
├── build.mjs                     # Build script (tsc + esbuild bundle)
├── LICENSE
└── README.md
```

**Build flow:**
- `tsc` compiles `src/service-worker.ts` → `ext/service-worker.js` and
  `src/lib/*.ts` → `ext/lib/*.js`
- `esbuild` bundles `src/options/options.ts` + `src/lib/*.ts` →
  `ext/options/options.js` (single file, no HTTP imports for the options page)
- CSS and HTML are static, copied directly

---

## Implementation Order

### Phase 1: Project scaffolding & build
1. `npm init`, install dev dependencies (`typescript`, `@types/chrome`, `esbuild`)
2. Create `tsconfig.json` targeting ES2020, strict mode, with paths for
   `src/` → `ext/` output
3. Create `build.mjs` — the build script that runs `tsc` for the service worker
   and shared lib, then `esbuild` for the options page bundle
4. Verify `npm run build` produces the expected `ext/` output

### Phase 2: Skeleton (get the extension loading)
5. Create `ext/manifest.json` with MV3 structure, permissions, and 4 commands
6. Create icon assets (or use placeholder PNGs)
7. Create `src/service-worker.ts` with top-level listeners that log on events
8. Build and verify the extension loads in `chrome://extensions` without errors

### Phase 3: Bookmarklet Utilities
9. Create `src/lib/bookmarklet-utils.ts`:
   - `getAllBookmarklets()` — walks bookmark tree, returns flat list of
     `{id, title, url}` for `javascript:` URLs
   - `decodeBookmarklet(url)` — strips `javascript:` prefix, decodes
   - `executeBookmarklet(tabId, bookmarkletUrl, disableCsp?)` — optionally adds
     declarativeNetRequest rule to strip CSP, then injects via
     `chrome.scripting.executeScript` with `world: 'MAIN'`
   - Types: `BookmarkletInfo`, `AppConfig`, `BookmarkletAssignment` (see Data
     Model above)

### Phase 4: Service Worker Wiring
10. Wire `action.onClicked` → reads toolbar choice from storage, runs
    `executeBookmarklet`
11. Wire `commands.onCommand` → reads shortcut mapping from storage, runs
    `executeBookmarklet`
12. Add error handling for restricted URLs (`chrome://`, `chrome-extension://`,
    `edge://`, etc.), no-active-tab, and CSP failures

### Phase 5: Options Page
13. Create `ext/options/options.html` with the two-section layout
14. Create `src/options/options.ts`:
    - On load: scan bookmarks, populate dropdowns
    - Load saved config from `chrome.storage.sync`, set dropdown values
    - Each bookmarklet assignment row has a "Disable CSP" checkbox
    - On save: write config (including CSP disable flags) to `chrome.storage.sync`
15. Create `src/options/options.css` for basic styling (copied to ext/ during build)
16. Add a "Customize keyboard shortcuts" link to `chrome://extensions/shortcuts`

### Phase 6: Polish & Edge Cases
17. Handle deleted bookmarklets (a saved choice points to a missing bookmarklet —
    show warning in options, skip silently at runtime)
18. Handle `file://` and `chrome://` URLs gracefully in the service worker
19. Test the "Allow extensions to override page shortcuts" user flow and document
    it in the options page

### Phase 7: Developer Installation Docs
20. Update README with step-by-step developer installation instructions:
    - Clone repo, `npm install`, `npm run build`
    - Open `chrome://extensions` (or `brave://extensions`), enable Developer mode
    - "Load unpacked" → select the `ext/` directory
    - Pin the extension to the toolbar
    - How to set up bookmarklets if you don't have any
    - How to customize keyboard shortcuts at `chrome://extensions/shortcuts`

---

## Open Questions

1. **Should the toolbar button also have a right-click context menu?** The
   README says "Right click the toolbar button and choose Options."
   `action.onClicked` doesn't distinguish left vs right click. We could add a
   context menu via `chrome.contextMenus` in the service worker, or simply rely
   on the established pattern where right-click → Options is a Chrome built-in
   for extensions. Chrome actually does provide this natively for MV3
   extensions: right-click the extension icon → "Options" appears. We should
   verify this works.

2. **Should we use `chrome.storage.sync` or `chrome.storage.local`?** Sync for
   the MVP (small config). The reference also uses sync.

3. **What if the user has zero bookmarklets or no bookmarklet configured for a
   slot?** Show an empty state in the options page with instructions on how to
   create a bookmarklet (drag any link with `javascript:` to the bookmarks bar).
   When the toolbar button is clicked or a shortcut invoked but no bookmarklet
   is configured, open the options page so the user sees the setup instructions
   (better than silently doing nothing or showing a cryptic error).

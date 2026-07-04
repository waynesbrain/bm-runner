# Bookmarklet Runner

`Bookmarklet Runner` is a Chrome extension that lets you run one of your
bookmarklets from a Chrome toolbar button and to run other bookmarklets from a
set of configurable keyboard shortcuts.

## Project Name

> `HUMOR` 😓 `IGNORE`

_If_ the project name **bm-runner** reminds you of _bowel movements_, that's on
you. Nobody is taking a massive bowel movement and sh!#@ting this extension out
because Google is continually removing user freedoms and killing 20 year old
extensions like `kill-sticky`, extensions which may also work perfectly fine as
bookmarklets, but that you'd much rather have in the old spot on the toolbar.

> `OBEY` 🫣 `CONSUME`

## Installation (Developer)

The MVP is installed as an unpacked extension (developer mode). Release
packaging will come later.

1. Clone this repo and build:

   ```sh
   git clone https://github.com/waynesbrain/bm-runner.git
   cd bm-runner
   npm install
   npm run build
   ```

2. Open Chrome (or Brave) and go to `chrome://extensions` (or
   `brave://extensions`).

3. Enable **Developer mode** (toggle in the top-right corner).

4. Click **Load unpacked** and select the `ext/` directory from this repo.

5. Pin `Bookmarklet Runner` to your toolbar: click the puzzle-piece (Extensions)
   icon, find Bookmarklet Runner, and click the pin.

## Development

```sh
npm run build    # one-shot build: tsc + esbuild + copy static files
npm run clean    # remove built artifacts from ext/
```

After making changes, run `npm run build` again, then click the reload icon on
the extension card in `chrome://extensions`.

**File layout:**

| Source                         | Built to                       | Notes                       |
| ------------------------------ | ------------------------------ | --------------------------- |
| `src/service-worker.ts`        | `ext/service-worker.js`        | Compiled by `tsc`           |
| `src/lib/bookmarklet-utils.ts` | `ext/lib/bookmarklet-utils.js` | Compiled by `tsc`           |
| `src/options/options.ts`       | `ext/options/options.js`       | Bundled by `esbuild`        |
| `src/options/options.html`     | `ext/options/options.html`     | Copied as-is                |
| `src/options/options.css`      | `ext/options/options.css`      | Copied as-is                |
| `ext/manifest.json`            | —                              | Hand-written, not generated |

## Setup

After installing the `Bookmarklet Runner`, click the Extensions (`puzzle-piece`)
icon in the Chrome toolbar and pin `Bookmarklet Runner` to your toolbar.

Right click the `Bookmarklet Runner` toolbar button and choose Options.

On the options screen, under "Toolbar Bookmarklet", choose one of the
bookmarklets detected in your bookmarks to run when you normally click the
`Bookmarklet Runner` toolbar button.

Another section of the options screen, "Keyboard Bookmarklets" allows you to
assign other bookmarklets to a set of keyboard shortcuts.

If Chrome supports it, an option to disallow web pages to override the keyboard
shortcuts in use will be offered.

## Creating Bookmarklets

If you don't have any bookmarklets yet, you can create them in Chrome's Bookmark
Manager (`Ctrl+Shift+O`):

1. Right-click anywhere in the bookmarks bar or a folder and choose **Add
   page**.
2. Set the **URL** to a `javascript:` URL. For example:
   ```
   javascript:alert('Hello, world!')
   ```
3. Give it a name and save.

Your bookmarklets will appear in the options page dropdowns automatically.

## Customizing Keyboard Shortcuts

Keyboard shortcuts are managed by Chrome, not the extension itself. To change
the key bindings:

1. Go to `chrome://extensions/shortcuts` (paste into your address bar).
2. Find **Bookmarklet Runner** in the list.
3. Click the pencil icon next to a shortcut and press your desired key combo.
4. To prevent web pages from overriding extension shortcuts, click the **"Allow
   extensions to override…"** toggle (or the per-shortcut equivalent) at the top
   of the shortcuts page.

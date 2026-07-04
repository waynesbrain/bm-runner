# References

## Bookmarklet Manager (original reference)

[ahmed-musallam/chrome-bookmarklet-manager](https://github.com/ahmed-musallam/chrome-bookmarklet-manager)
— cloned to `bm-runner-refs/chrome-bookmarklet-manager/`

## CSP Disabling (reference implementations)

These extensions disable Content-Security-Policy headers in Chromium browsers.
Cloned to `bm-runner-refs/` for reference on the CSP bypass feature.

### PhilGrayson/chrome-csp-disable (60K users, most popular)
- [GitHub](https://github.com/PhilGrayson/chrome-csp-disable)
- Cloned to `bm-runner-refs/chrome-csp-disable/`
- **Approach:** MV3, `declarativeNetRequest.updateSessionRules` with `tabIds`
  condition to remove `content-security-policy` response header on specific tabs.
  Per-tab toggle via toolbar button. Also clears service workers on tab update
  to bust application cache.

### lisonge/Disable-CSP (most comprehensive)
- [GitHub](https://github.com/lisonge/Disable-CSP)
- Cloned to `bm-runner-refs/Disable-CSP/`
- **Approach:** MV3, `declarativeNetRequest.updateDynamicRules` with `urlFilter`
  to remove multiple CSP-related headers (`content-security-policy`,
  `content-security-policy-report-only`, `x-webkit-csp`,
  `x-content-security-policy`, `x-frame-options`). Also uses `debugger` API +
  devtools page to strip `<meta>` CSP tags from HTML. TypeScript + Vite build.

### WithoutHair/Disable-Content-Security-Policy (simplest)
- [GitHub](https://github.com/WithoutHair/Disable-Content-Security-Policy)
- Cloned to `bm-runner-refs/Disable-Content-Security-Policy/`
- **Approach:** MV3, `declarativeNetRequest.updateSessionRules` with per-URL
  `urlFilter`. Sets CSP header to empty string rather than removing it.
  Simplest implementation — single `background.js` file.


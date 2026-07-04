// ---------------------------------------------------------------------------
// Icon canvas drawing utilities
// ---------------------------------------------------------------------------
// Functions for drawing onto OffscreenCanvas instances to produce toolbar
// icon ImageData at runtime.  Used by the service worker (MV3) where DOM
// canvas is unavailable.
// ---------------------------------------------------------------------------

export const GENERIC_FONT_FAMILIES = [
  "monospace",
  "sans-serif",
  "serif",
  "cursive",
  "fantasy",
  "system-ui",
] as const;

/** CSS generic font family or any custom string. */
export type FontFamily = (typeof GENERIC_FONT_FAMILIES)[number] | (string & {});

/** The built-in fallback appended when the caller doesn't provide one. */
const DEFAULT_FALLBACK = "sans-serif";

/**
 * Ensure the font-family value ends with a known generic so canvas rendering
 * doesn't silently degrade to the browser's default if the primary font is
 * missing.  If the last family in the list is already generic the value is
 * returned as-is; otherwise `sans-serif` is appended as the ultimate fallback.
 */
function withFallback(fontFamily: string): string {
  const parts = fontFamily
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
  const last = parts[parts.length - 1]!;
  if ((GENERIC_FONT_FAMILIES as readonly string[]).includes(last)) {
    return fontFamily;
  }
  return `${fontFamily}, ${DEFAULT_FALLBACK}`;
}

// ---- shared context for all drawing functions -------------------------------

export interface DrawingOptions {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

// ---- drawLetter ------------------------------------------------------------

export interface LetterOptions extends DrawingOptions {
  /** Background fill colour (default: '#6b6b6bff') */
  bgColor?: string;
  /** CSS font-family value (default: 'sans-serif').  A fallback of `sans-serif`
   * is appended automatically unless the caller already provides one. */
  fontFamily?: FontFamily;
  /** Text fill colour (default: '#f9f9f9ff') */
  textColor?: string;
}

/**
 * Draw a single letter onto a square canvas so it fills the available height.
 *
 * The letter is scaled to occupy the full vertical space within the canvas,
 * less a small margin (1 / 6 of the canvas size) on each side so the glyph
 * never touches the edges.  It is centred horizontally.
 */
export function drawLetter(letter: string, options: LetterOptions): void {
  const {
    canvas,
    ctx,
    bgColor = "#6b6b6bff",
    textColor = "#f9f9f9ff",
    fontFamily: rawFontFamily = "sans-serif",
  } = options;

  const fontFamily = withFallback(rawFontFamily);

  const size = Math.min(canvas.width, canvas.height);
  const margin = Math.ceil(size / 6); // ~3 px on a 16×16 icon

  // ---- background (rounded rect) ----------------------------------------
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 2);
  ctx.fill();

  // ---- measure at a trial size to find the right scale ------------------
  const availableHeight = size - 2 * margin;

  ctx.font = `${availableHeight}px ${fontFamily}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";

  const trialMetrics = ctx.measureText(letter);
  const trialHeight =
    trialMetrics.actualBoundingBoxAscent +
    trialMetrics.actualBoundingBoxDescent;

  // Scale the font so the glyph fills the available height.
  const fontSize = availableHeight * (availableHeight / trialHeight);
  ctx.font = `${fontSize}px ${fontFamily}`;

  // ---- re-measure to position the baseline precisely ---------------------
  const m = ctx.measureText(letter);

  // Place the baseline so the top of the glyph sits at the top margin.
  const baselineY = margin + m.actualBoundingBoxAscent;

  ctx.fillStyle = textColor;
  ctx.fillText(letter, canvas.width / 2 + canvas.width / 16, baselineY);
}

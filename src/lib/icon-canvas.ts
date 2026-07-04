// ---------------------------------------------------------------------------
// Icon canvas drawing utilities
// ---------------------------------------------------------------------------
// Functions for drawing onto OffscreenCanvas instances to produce toolbar
// icon ImageData at runtime.  Used by the service worker (MV3) where DOM
// canvas is unavailable.
// ---------------------------------------------------------------------------

export const GENERIC_FONT_FAMILIES = [
  'monospace',
  'sans-serif',
  'serif',
  'cursive',
  'fantasy',
  'system-ui',
] as const;

/** CSS generic font family or any custom string. */
export type FontFamily = (typeof GENERIC_FONT_FAMILIES)[number] | (string & {});

/** The built-in fallback appended when the caller doesn't provide one. */
const DEFAULT_FALLBACK = 'monospace';

/**
 * Ensure the font-family value ends with a known generic so canvas rendering
 * doesn't silently degrade to the browser's default if the primary font is
 * missing.  If the last family in the list is already generic the value is
 * returned as-is; otherwise `monospace` is appended as the ultimate fallback.
 */
function withFallback(fontFamily: string): string {
  const parts = fontFamily
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
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
  /** Background fill colour (default: '#2563eb') */
  bgColor?: string;
  /** Text fill colour (default: '#ffffff') */
  textColor?: string;
  /** CSS font-family value (default: 'monospace').  A fallback of `monospace`
   * is appended automatically unless the caller already provides one. */
  fontFamily?: FontFamily;
}

/**
 * Draw a single letter onto a square canvas so it fills the available height.
 *
 * The letter is scaled to occupy the full vertical space within the canvas,
 * less a small margin (1/8 of the canvas size) on each side so the glyph
 * never touches the edges.  It is centred horizontally.
 */
export function drawLetter(letter: string, options: LetterOptions): void {
  const {
    canvas,
    ctx,
    bgColor = '#2563eb',
    textColor = '#ffffff',
    fontFamily: rawFontFamily = 'monospace',
  } = options;

  const fontFamily = withFallback(rawFontFamily);

  const size = Math.min(canvas.width, canvas.height);
  const margin = Math.ceil(size / 8); // ~2 px on a 16×16 icon

  // ---- background -------------------------------------------------------
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ---- measure at a trial size to find the right scale ------------------
  const availableHeight = size - 2 * margin;

  ctx.font = `${availableHeight}px ${fontFamily}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';

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
  ctx.fillText(letter, canvas.width / 2, baselineY);
}

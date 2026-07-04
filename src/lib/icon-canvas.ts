// ---------------------------------------------------------------------------
// Icon canvas drawing utilities
// ---------------------------------------------------------------------------
// Functions for drawing onto OffscreenCanvas instances to produce toolbar
// icon ImageData at runtime.  Used by the service worker (MV3) where DOM
// canvas is unavailable.
// ---------------------------------------------------------------------------

export interface LetterOptions {
  /** Background fill colour (default: '#2563eb') */
  bgColor?: string;
  /** Text fill colour (default: '#ffffff') */
  textColor?: string;
  /** CSS font-family string (default: 'sans-serif') */
  fontFamily?: string;
}

/**
 * Draw a single letter onto a square canvas so it fills the available height.
 *
 * The letter is scaled to occupy the full vertical space within the canvas,
 * less a small margin (1/8 of the canvas size) on each side so the glyph
 * never touches the edges.  It is centred horizontally.
 */
export function drawLetter(
  letter: string,
  canvas: OffscreenCanvas,
  ctx: OffscreenCanvasRenderingContext2D,
  options: LetterOptions = {},
): void {
  const {
    bgColor = '#2563eb',
    textColor = '#ffffff',
    fontFamily = 'sans-serif',
  } = options;

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

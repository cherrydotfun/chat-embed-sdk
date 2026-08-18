import type { EmbedTheme } from './types';

const DEFAULT_EMBED_URL = 'https://embed.cherry.fun';

/** Gutter between the floating card and the viewport edges. */
export const FLOATING_GUTTER_PX = 20;
/** Floating card size. The `chatBubble` launcher derives its open pose from the height. */
const FLOATING_WIDTH_PX = 380;
export const FLOATING_HEIGHT_PX = 520;
/** Top of the stacking order. The launcher takes it and demotes the card by one. */
export const MAX_Z_INDEX = 2147483647;
// The embed's own canvases, used when no theme sets a background. Must track the
// engine's mode defaults (useEmbedTheme DEF_BG_DARK `--bg-primary` / DEF_BG_LIGHT).
const DEFAULT_BACKGROUND_DARK = '#0a0a0f';
const DEFAULT_BACKGROUND_LIGHT = '#ffffff';

export function createEmbedIframe(config: {
  appId: string;
  roomId?: string;
  mode?: string;
  embedUrl?: string;
  container: HTMLElement;
  position: 'inline' | 'floating-right' | 'floating-left';
  /** The host theme — its element-side half is painted here, see applyIframeSurface. */
  theme?: EmbedTheme;
}): HTMLIFrameElement {
  const iframe = document.createElement('iframe');

  // Build URL with query params
  const url = new URL('/', config.embedUrl || DEFAULT_EMBED_URL);
  url.searchParams.set('appId', config.appId);
  if (config.roomId) url.searchParams.set('roomId', config.roomId);
  if (config.mode) url.searchParams.set('mode', config.mode);
  iframe.src = url.toString();

  // Security attributes
  iframe.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-popups', 'allow-forms');
  iframe.allow = 'clipboard-write';

  // Accessibility
  iframe.title = 'Cherry Chat';

  // Base styles — no border, no intrinsic sizing issues
  iframe.style.border = 'none';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  applyIframeSurface(iframe, config.theme);

  if (config.position === 'inline') {
    iframe.style.display = 'block';
  } else {
    applyFloatingStyles(iframe, config.position);
  }

  config.container.appendChild(iframe);
  return iframe;
}

export function applyFloatingStyles(
  iframe: HTMLIFrameElement,
  position: 'floating-right' | 'floating-left',
): void {
  iframe.style.position = 'fixed';
  iframe.style.bottom = `${FLOATING_GUTTER_PX}px`;
  iframe.style[position === 'floating-right' ? 'right' : 'left'] = `${FLOATING_GUTTER_PX}px`;
  iframe.style.width = `${FLOATING_WIDTH_PX}px`;
  iframe.style.height = `${FLOATING_HEIGHT_PX}px`;
  // Cap to viewport so the widget never extends past the screen edges
  // on short viewports (e.g. mobile portrait, embedded panes). The 40px
  // budget keeps the 20px anchor on the bottom-right + 20px breathing
  // room on the opposite side.
  iframe.style.maxWidth = `calc(100vw - ${FLOATING_GUTTER_PX * 2}px)`;
  iframe.style.maxHeight = `calc(100vh - ${FLOATING_GUTTER_PX * 2}px)`;
  iframe.style.borderRadius = '16px';
  iframe.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';
  iframe.style.zIndex = String(MAX_Z_INDEX);
  iframe.style.transition = 'opacity 0.2s, transform 0.2s';
}

// Alpha / `transparent` backgrounds are see-through on purpose (overlay mode);
// anything unparseable counts as opaque. Exported for tests only.
export function isOpaqueColor(value: string): boolean {
  const color = value.trim().toLowerCase();
  if (color === 'transparent') return false;

  const digits = /^#([0-9a-f]{3,8})$/.exec(color)?.[1];
  if (digits !== undefined) {
    if (digits.length === 4) return digits.slice(3) === 'f'; // #rgba
    if (digits.length === 8) return digits.slice(6) === 'ff'; // #rrggbbaa
    return true; // #rgb / #rrggbb carry no alpha channel
  }

  // rgb()/hsl() families: alpha is the 4th comma-separated value, or follows a
  // slash in the modern `rgb(r g b / a)` syntax. Absent means fully opaque.
  const args = /^(?:rgba?|hsla?)\(([^)]*)\)$/.exec(color)?.[1];
  if (args !== undefined) {
    const slashed = args.split('/');
    const alpha = (slashed.length > 1 ? slashed[1] : args.split(',')[3])?.trim() ?? '';
    if (alpha === '') return true;
    const n = alpha.endsWith('%') ? Number(alpha.slice(0, -1)) / 100 : Number(alpha);
    return !Number.isFinite(n) || n >= 1;
  }

  return true;
}

// Ground the iframe ELEMENT: between documents (mount, reload, remount) the
// embed has nothing painted yet and the host page would show straight through.
// A see-through theme background CLEARS the ground instead — an iframe element
// with no background-color of its own is already transparent, which is what puts
// the widget in overlay mode. Never set the `background` shorthand here: it
// resets background-color and would silently undo this.
// With no theme background the ground follows `mode`, like the engine's own
// fallback — a light theme must not pre-paint near-black.
export function applyIframeBackground(
  iframe: HTMLIFrameElement,
  backgroundColor: string | undefined,
  mode?: 'dark' | 'light',
): void {
  if (backgroundColor === undefined || backgroundColor.trim() === '') {
    iframe.style.backgroundColor =
      mode === 'light' ? DEFAULT_BACKGROUND_LIGHT : DEFAULT_BACKGROUND_DARK;
    iframe.style.colorScheme = 'normal';
    return;
  }
  const opaque = isOpaqueColor(backgroundColor);
  iframe.style.backgroundColor = opaque ? backgroundColor : '';
  // The element's color-scheme must MATCH the embed document's for a see-through
  // widget: the document declares `color-scheme: dark`, and Chromium paints an
  // OPAQUE frame canvas whenever the two disagree — so the host page never shows
  // through and the host-side blur has nothing to frost. `''` is not enough: it
  // inherits the host page's scheme, which on an ordinary light site is `normal`
  // again. Opaque grounds keep `normal` (light UA canvas under our own paint).
  iframe.style.colorScheme = opaque ? 'normal' : 'dark';
}

/**
 * Sanitize a backgroundBlur value to a px radius: a finite integer clamped 0–40,
 * or null. Mirrors the embed engine's `sanitizeBlurPx` so host and iframe agree.
 */
function sanitizeBlurPx(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value.trim())
        : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(40, Math.max(0, Math.round(n)));
}

/**
 * Apply (or clear) the host-side backdrop blur on the iframe element. A cross-origin
 * iframe's OWN backdrop-filter cannot reach the host page, so frosting the host page
 * behind a see-through widget has to happen on the IFRAME ELEMENT — it lives in the
 * HOST document, so its backdrop IS the host page. A valid number > 0 sets
 * `backdrop-filter: blur(Npx)` (+ the `-webkit-` prefix for Safari); an absent /
 * invalid / zero value clears it. Only meaningful with a see-through theme
 * background; harmless otherwise (the opaque ground paints over it).
 */
export function applyIframeBackdropBlur(
  iframe: HTMLIFrameElement,
  backgroundBlur: number | string | undefined,
): void {
  const px = sanitizeBlurPx(backgroundBlur);
  const filter = px !== null && px > 0 ? `blur(${px}px)` : '';
  iframe.style.backdropFilter = filter;
  (
    iframe.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }
  ).webkitBackdropFilter = filter;
}

/**
 * The ONE place the iframe element's own surface is decided. Everything a theme
 * paints outside the embed document — the ground and the host-side blur — is
 * resolved here so mount, `setTheme` and `resetTheme` cannot drift apart or
 * overwrite each other. `undefined` is the reset: default ground, no blur.
 * In-iframe surface blurs (headerBlur / inputBlur) are NOT here; they travel with
 * the theme over the `setTheme` command.
 */
export function applyIframeSurface(
  iframe: HTMLIFrameElement,
  theme: EmbedTheme | undefined,
): void {
  applyIframeBackground(iframe, theme?.backgroundColor, theme?.mode);
  applyIframeBackdropBlur(iframe, theme?.backgroundBlur);
}

export function getEmbedOrigin(embedUrl?: string): string {
  try {
    return new URL(embedUrl || DEFAULT_EMBED_URL).origin;
  } catch {
    return new URL(DEFAULT_EMBED_URL).origin;
  }
}

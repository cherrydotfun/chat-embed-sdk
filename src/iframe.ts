const DEFAULT_EMBED_URL = 'https://embed.cherry.fun';

export function createEmbedIframe(config: {
  appId: string;
  roomId?: string;
  mode?: string;
  embedUrl?: string;
  container: HTMLElement;
  position: 'inline' | 'floating-right' | 'floating-left';
  /**
   * Host-side backdrop blur (px). Applied to the iframe ELEMENT so it frosts the
   * host page behind a see-through widget — see `applyIframeBackdropBlur`.
   */
  backgroundBlur?: number | string;
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
  iframe.style.colorScheme = 'normal';

  // Transparent by default so a theme with an alpha / `transparent` background
  // (Twitch-style overlay mode) composites the host page THROUGH the iframe.
  // Harmless for opaque themes — the embed paints its own solid ground on top.
  // `allowtransparency` is the legacy attribute some engines still require to
  // honour a transparent iframe document background.
  iframe.style.background = 'transparent';
  iframe.setAttribute('allowtransparency', 'true');

  // Host-side backdrop blur. A cross-origin iframe's OWN backdrop-filter cannot
  // reach the host page, so to frost the host page behind a see-through widget the
  // blur must live on the IFRAME ELEMENT itself — it sits in the HOST document, so
  // its backdrop IS the host page. Only meaningful with a transparent / alpha theme
  // background; harmless otherwise (the opaque embed paints over it).
  applyIframeBackdropBlur(iframe, config.backgroundBlur);

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
  iframe.style.bottom = '20px';
  iframe.style[position === 'floating-right' ? 'right' : 'left'] = '20px';
  iframe.style.width = '380px';
  iframe.style.height = '520px';
  // Cap to viewport so the widget never extends past the screen edges
  // on short viewports (e.g. mobile portrait, embedded panes). The 40px
  // budget keeps the 20px anchor on the bottom-right + 20px breathing
  // room on the opposite side.
  iframe.style.maxWidth = 'calc(100vw - 40px)';
  iframe.style.maxHeight = 'calc(100vh - 40px)';
  iframe.style.borderRadius = '16px';
  iframe.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';
  iframe.style.zIndex = '2147483647'; // Max z-index
  iframe.style.transition = 'opacity 0.2s, transform 0.2s';
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
 * Apply (or clear) the host-side backdrop blur on the iframe element. A valid
 * number > 0 sets `backdrop-filter: blur(Npx)` (+ the `-webkit-` prefix for
 * Safari); an absent / invalid / zero value clears it. Exported so the SDK can
 * re-apply it when a host calls `setTheme({ backgroundBlur })` after mount.
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

export function getEmbedOrigin(embedUrl?: string): string {
  try {
    return new URL(embedUrl || DEFAULT_EMBED_URL).origin;
  } catch {
    return new URL(DEFAULT_EMBED_URL).origin;
  }
}

const DEFAULT_EMBED_URL = 'https://embed.cherry.fun';

/** The embed's own dark canvas (`--bg-primary`), used when no theme sets one. */
const DEFAULT_BACKGROUND = '#0a0a0f';

export function createEmbedIframe(config: {
  appId: string;
  roomId?: string;
  mode?: string;
  embedUrl?: string;
  container: HTMLElement;
  position: 'inline' | 'floating-right' | 'floating-left';
  /** Theme background, painted on the element itself — see applyIframeBackground. */
  backgroundColor?: string;
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
  applyIframeBackground(iframe, config.backgroundColor);

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
// Skipped for see-through theme backgrounds — that transparency is intentional.
export function applyIframeBackground(
  iframe: HTMLIFrameElement,
  backgroundColor: string | undefined,
): void {
  if (backgroundColor === undefined || backgroundColor.trim() === '') {
    iframe.style.backgroundColor = DEFAULT_BACKGROUND;
    return;
  }
  iframe.style.backgroundColor = isOpaqueColor(backgroundColor) ? backgroundColor : '';
}

export function getEmbedOrigin(embedUrl?: string): string {
  try {
    return new URL(embedUrl || DEFAULT_EMBED_URL).origin;
  } catch {
    return new URL(DEFAULT_EMBED_URL).origin;
  }
}

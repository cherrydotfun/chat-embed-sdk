const DEFAULT_EMBED_URL = 'https://embed.cherry.fun';

/** Gutter between the floating card and the viewport edges. */
export const FLOATING_GUTTER_PX = 20;
/** Floating card size. The `chatBubble` launcher derives its open pose from the height. */
const FLOATING_WIDTH_PX = 380;
export const FLOATING_HEIGHT_PX = 520;
/** Top of the stacking order. The launcher takes it and demotes the card by one. */
export const MAX_Z_INDEX = 2147483647;

export function createEmbedIframe(config: {
  appId: string;
  roomId?: string;
  mode?: string;
  embedUrl?: string;
  container: HTMLElement;
  position: 'inline' | 'floating-right' | 'floating-left';
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

export function getEmbedOrigin(embedUrl?: string): string {
  try {
    return new URL(embedUrl || DEFAULT_EMBED_URL).origin;
  } catch {
    return new URL(DEFAULT_EMBED_URL).origin;
  }
}

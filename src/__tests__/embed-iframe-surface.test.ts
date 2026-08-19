/**
 * Tests for the iframe ELEMENT surface at its real seam — `createEmbedIframe`
 * and the `CherryEmbed` theme lifecycle, not the helpers in isolation.
 *
 * Both halves of that surface (the ground and the host-side backdrop blur) are
 * painted on the same element by the same pass, so they are easy to make each
 * other's undoing — a stray `background` shorthand next to the ground, or a
 * second call site that only refreshes one of them. Asserting through
 * `createEmbedIframe` is what makes that visible; helper-level tests cannot see
 * it, because the element they inspect was never built by the real code path.
 *
 * jsdom normalises assigned colours (`#abc` → `rgb(170, 187, 204)`), so
 * assertions compare against a probe element fed the same input.
 */

import './jsdomIframe';
import { describe, it, expect } from 'vitest';
import { CherryEmbed } from '../embed';
import { createEmbedIframe } from '../iframe';
import type { EmbedTheme } from '../types';

// The per-mode defaults in `iframe.ts`
const DEFAULT_BACKGROUND_DARK = '#0a0a0f';
const DEFAULT_BACKGROUND_LIGHT = '#ffffff';

const EMBED_ORIGIN = 'https://embed.cherry.fun';

// What jsdom stores after assigning `value` to `style.backgroundColor`
function normalized(value: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = value;
  return probe.style.backgroundColor;
}

function buildIframe(theme?: EmbedTheme): HTMLIFrameElement {
  return createEmbedIframe({
    appId: 'app-surface',
    container: document.createElement('div'),
    position: 'inline',
    theme,
  });
}

function dispatchEmbedEvent(eventName: string, data?: unknown): void {
  const msg = { type: 'cherry:event', event: eventName, data };
  window.dispatchEvent(new MessageEvent('message', { data: msg, origin: EMBED_ORIGIN }));
}

async function mountEmbed(
  theme?: EmbedTheme,
): Promise<{ chat: CherryEmbed; iframe: HTMLIFrameElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const chat = new CherryEmbed({ appId: 'app-surface', container, theme });

  const mountPromise = chat.mount();
  dispatchEmbedEvent('ready');
  await mountPromise;

  return { chat, iframe: container.querySelector('iframe')! };
}

// ---------------------------------------------------------------------------
// createEmbedIframe — the ground survives the whole construction pass
// ---------------------------------------------------------------------------

describe('createEmbedIframe — ground', () => {
  it('grounds a dark theme on the dark canvas', () => {
    expect(buildIframe({ mode: 'dark' }).style.backgroundColor).toBe(
      normalized(DEFAULT_BACKGROUND_DARK),
    );
  });

  it('grounds a light theme on white', () => {
    expect(buildIframe({ mode: 'light' }).style.backgroundColor).toBe(
      normalized(DEFAULT_BACKGROUND_LIGHT),
    );
  });

  it('grounds an unthemed embed on the dark canvas', () => {
    expect(buildIframe().style.backgroundColor).toBe(normalized(DEFAULT_BACKGROUND_DARK));
  });

  it('paints an explicit opaque background and nothing later wipes it', () => {
    const iframe = buildIframe({ mode: 'light', backgroundColor: '#123456' });

    // Regression lock: a `background` shorthand anywhere in this function resets
    // background-color, so the ground would come out empty here.
    expect(iframe.style.backgroundColor).toBe(normalized('#123456'));
  });

  it('leaves a transparent theme see-through', () => {
    expect(buildIframe({ backgroundColor: 'transparent' }).style.backgroundColor).toBe('');
  });

  it('leaves an alpha background see-through', () => {
    expect(buildIframe({ backgroundColor: '#11223300' }).style.backgroundColor).toBe('');
  });
});

// ---------------------------------------------------------------------------
// createEmbedIframe — color-scheme follows the ground
// ---------------------------------------------------------------------------
// The element's color-scheme has to match the embed document (`dark`) for a
// see-through widget: a mismatch makes Chromium paint the frame canvas opaque,
// so the host page never shows through and the host-side blur has nothing to
// frost. Opaque grounds keep `normal` (light UA canvas under our own paint).

describe('createEmbedIframe — color-scheme', () => {
  it('forces normal under an opaque ground (default, mode, explicit colour)', () => {
    expect(buildIframe().style.colorScheme).toBe('normal');
    expect(buildIframe({ mode: 'light' }).style.colorScheme).toBe('normal');
    expect(buildIframe({ backgroundColor: '#123456' }).style.colorScheme).toBe('normal');
  });

  it('matches the embed document (dark) for a see-through theme so the canvas stays transparent', () => {
    // '' would only inherit the host page's scheme — `normal` on an ordinary
    // light site, i.e. the very mismatch that paints the frame canvas opaque.
    expect(buildIframe({ backgroundColor: 'transparent' }).style.colorScheme).toBe('dark');
    expect(buildIframe({ backgroundColor: '#11223300' }).style.colorScheme).toBe('dark');
    expect(buildIframe({ backgroundColor: 'transparent', backgroundBlur: 12 }).style.colorScheme).toBe('dark');
  });
});

// ---------------------------------------------------------------------------
// createEmbedIframe — host-side blur
// ---------------------------------------------------------------------------

describe('createEmbedIframe — host-side blur', () => {
  it('frosts the host page behind an overlay theme', () => {
    const iframe = buildIframe({ backgroundColor: 'transparent', backgroundBlur: 12 });

    expect(iframe.style.backdropFilter).toBe('blur(12px)');
    expect(iframe.style.backgroundColor).toBe('');
  });

  it('accepts a numeric string and clamps to the engine ceiling', () => {
    expect(buildIframe({ backgroundBlur: '8' }).style.backdropFilter).toBe('blur(8px)');
    expect(buildIframe({ backgroundBlur: 999 }).style.backdropFilter).toBe('blur(40px)');
  });

  it('leaves no filter when unset, zero or unparseable', () => {
    expect(buildIframe().style.backdropFilter).toBe('');
    expect(buildIframe({ backgroundBlur: 0 }).style.backdropFilter).toBe('');
    expect(buildIframe({ backgroundBlur: 'plenty' }).style.backdropFilter).toBe('');
  });

  it('coexists with an opaque ground — both halves land', () => {
    const iframe = buildIframe({ backgroundColor: '#123456', backgroundBlur: 10 });

    expect(iframe.style.backgroundColor).toBe(normalized('#123456'));
    expect(iframe.style.backdropFilter).toBe('blur(10px)');
  });
});

// ---------------------------------------------------------------------------
// CherryEmbed — the surface tracks the theme lifecycle
// ---------------------------------------------------------------------------

describe('CherryEmbed — surface over the theme lifecycle', () => {
  it('repaints the ground on a mode-only setTheme', async () => {
    const { chat, iframe } = await mountEmbed({ mode: 'dark' });
    expect(iframe.style.backgroundColor).toBe(normalized(DEFAULT_BACKGROUND_DARK));

    chat.setTheme({ mode: 'light' });

    expect(iframe.style.backgroundColor).toBe(normalized(DEFAULT_BACKGROUND_LIGHT));

    chat.destroy();
  });

  it('applies a blur added after mount', async () => {
    const { chat, iframe } = await mountEmbed({ backgroundColor: 'transparent' });
    expect(iframe.style.backdropFilter).toBe('');

    chat.setTheme({ backgroundBlur: 16 });

    expect(iframe.style.backdropFilter).toBe('blur(16px)');

    chat.destroy();
  });

  it('keeps the blur across an unrelated setTheme', async () => {
    const { chat, iframe } = await mountEmbed({
      backgroundColor: 'transparent',
      backgroundBlur: 16,
    });

    chat.setTheme({ fontSize: 'lg' });

    expect(iframe.style.backdropFilter).toBe('blur(16px)');
    expect(iframe.style.backgroundColor).toBe('');

    chat.destroy();
  });

  it('drops a see-through ground when the host switches to an opaque background', async () => {
    const { chat, iframe } = await mountEmbed({ backgroundColor: 'transparent' });
    expect(iframe.style.colorScheme).toBe('dark');

    chat.setTheme({ backgroundColor: '#123456' });

    expect(iframe.style.backgroundColor).toBe(normalized('#123456'));
    expect(iframe.style.colorScheme).toBe('normal');

    chat.destroy();
  });

  it('releases the forced scheme when the host goes see-through after an opaque mount', async () => {
    const { chat, iframe } = await mountEmbed({ mode: 'dark' });
    expect(iframe.style.colorScheme).toBe('normal');

    chat.setTheme({ backgroundColor: 'transparent', backgroundBlur: 8 });

    expect(iframe.style.backgroundColor).toBe('');
    expect(iframe.style.colorScheme).toBe('dark');
    expect(iframe.style.backdropFilter).toBe('blur(8px)');

    chat.destroy();
  });

  it('clears both halves on resetTheme', async () => {
    const { chat, iframe } = await mountEmbed({
      mode: 'light',
      backgroundColor: 'transparent',
      backgroundBlur: 16,
    });
    expect(iframe.style.backdropFilter).toBe('blur(16px)');

    chat.resetTheme();

    expect(iframe.style.backdropFilter).toBe('');
    expect(iframe.style.backgroundColor).toBe(normalized(DEFAULT_BACKGROUND_DARK));
    expect(iframe.style.colorScheme).toBe('normal');

    chat.destroy();
  });
});

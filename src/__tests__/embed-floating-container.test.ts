/**
 * Tests for optional `container` on floating positions.
 *
 * The portal docs (display-modes) instruct hosts to omit `container` for
 * `floating-right` / `floating-left`; the widget must then mount to
 * `document.body`. Inline embeds still require a container.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CherryEmbed } from '../embed';
import { createEmbedIframe } from '../iframe';

vi.mock('../iframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../iframe')>();
  return {
    ...actual,
    createEmbedIframe: vi.fn(() => {
      const fakeIframe = {
        style: {},
        contentWindow: { postMessage: vi.fn() },
        remove: vi.fn(),
      } as unknown as HTMLIFrameElement;
      return fakeIframe;
    }),
  };
});

const EMBED_ORIGIN = 'https://embed.cherry.fun';

function dispatchEmbedEvent(eventName: string, data?: unknown): void {
  const msg = { type: 'cherry:event', event: eventName, data };
  window.dispatchEvent(new MessageEvent('message', { data: msg, origin: EMBED_ORIGIN }));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('CherryEmbed — container requirement by position', () => {
  it('throws without container when position is omitted (inline default)', () => {
    expect(() => new CherryEmbed({ appId: 'app-1' })).toThrowError(
      'CherryEmbed: container is required for inline embeds',
    );
  });

  it('throws without container when position is explicitly inline', () => {
    expect(() => new CherryEmbed({ appId: 'app-2', position: 'inline' })).toThrowError(
      'CherryEmbed: container is required for inline embeds',
    );
  });

  it('constructs without container for floating-right', () => {
    expect(() => new CherryEmbed({ appId: 'app-3', position: 'floating-right' })).not.toThrow();
  });

  it('constructs without container for floating-left', () => {
    expect(() => new CherryEmbed({ appId: 'app-4', position: 'floating-left' })).not.toThrow();
  });

  it('still accepts an explicit container for floating positions', () => {
    expect(
      () =>
        new CherryEmbed({
          appId: 'app-5',
          position: 'floating-right',
          container: document.createElement('div'),
        }),
    ).not.toThrow();
  });
});

describe('CherryEmbed — floating mount without container', () => {
  it('mounts to document.body when container is omitted', async () => {
    const chat = new CherryEmbed({
      appId: 'app-6',
      position: 'floating-right',
      roomId: 'room-1',
    });

    const mountPromise = chat.mount();
    // Resolve the ready-wait: the (real) bridge listens on window messages.
    dispatchEmbedEvent('ready');
    await mountPromise;

    expect(createEmbedIframe).toHaveBeenCalledOnce();
    const callArg = vi.mocked(createEmbedIframe).mock.calls[0]![0];
    expect(callArg.container).toBe(document.body);
    expect(callArg.position).toBe('floating-right');

    chat.destroy();
  });

  it('mounts to the provided container when one is given', async () => {
    const host = document.createElement('div');
    const chat = new CherryEmbed({
      appId: 'app-7',
      position: 'floating-left',
      container: host,
    });

    const mountPromise = chat.mount();
    dispatchEmbedEvent('ready');
    await mountPromise;

    const callArg = vi.mocked(createEmbedIframe).mock.calls[0]![0];
    expect(callArg.container).toBe(host);

    chat.destroy();
  });
});

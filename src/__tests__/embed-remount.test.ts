/**
 * A second `mount()` must replace the first, not stack: an orphaned bridge keeps
 * its `message` listener and re-runs the handshake on every later `ready`.
 *
 * The iframe factory is mocked with REAL iframe elements here (the other suites
 * stub plain objects) so DOM counts mean what they say.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CherryEmbed } from '../embed';
import { createEmbedIframe } from '../iframe';
import type { BridgeCommand } from '../types';

vi.mock('../iframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../iframe')>();
  return {
    ...actual,
    createEmbedIframe: vi.fn((config: { container: HTMLElement }) => {
      const el = document.createElement('iframe');
      Object.defineProperty(el, 'contentWindow', { value: { postMessage: vi.fn() } });
      config.container.appendChild(el);
      return el;
    }),
  };
});

const EMBED_ORIGIN = 'https://embed.cherry.fun';

function dispatchEmbedEvent(eventName: string, data?: unknown): void {
  const msg = { type: 'cherry:event', event: eventName, data };
  window.dispatchEvent(new MessageEvent('message', { data: msg, origin: EMBED_ORIGIN }));
}

/** The nth iframe created by the mocked factory (one per mount). */
function mountedIframe(index: number): HTMLIFrameElement {
  return vi.mocked(createEmbedIframe).mock.results[index]!.value as HTMLIFrameElement;
}

/** Params of every command with `method` posted to the iframe, in order. */
function commandParams(iframe: HTMLIFrameElement, method: string): unknown[] {
  return vi
    .mocked(iframe.contentWindow!.postMessage)
    .mock.calls.map((call) => call[0] as BridgeCommand)
    .filter((msg) => msg.type === 'cherry:cmd' && msg.method === method)
    .map((msg) => msg.params);
}

const cleanups: Array<() => void> = [];

/** Mounts a floating embed and settles the handshake. */
async function mountedChat() {
  const chat = new CherryEmbed({
    appId: 'app-remount',
    position: 'floating-right',
    collapsed: true,
  });
  cleanups.push(() => chat.destroy());
  await remount(chat);
  return chat;
}

async function remount(chat: CherryEmbed): Promise<void> {
  const mountPromise = chat.mount();
  dispatchEmbedEvent('ready');
  await mountPromise;
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  vi.clearAllMocks();
});

describe('CherryEmbed — mount() twice', () => {
  it('leaves exactly one iframe in the DOM', async () => {
    const chat = await mountedChat();
    const first = mountedIframe(0);

    await remount(chat);

    expect(document.body.querySelectorAll('iframe')).toHaveLength(1);
    expect(first.isConnected).toBe(false);
    expect(mountedIframe(1).isConnected).toBe(true);
  });

  it('runs the handshake once per ready — the stale bridge is gone', async () => {
    const chat = await mountedChat();
    const first = mountedIframe(0);

    await remount(chat);
    const second = mountedIframe(1);
    vi.mocked(first.contentWindow!.postMessage).mockClear();
    vi.mocked(second.contentWindow!.postMessage).mockClear();

    // The live iframe reloaded itself (sign-in / wallet switch) and re-handshakes.
    dispatchEmbedEvent('ready');

    expect(commandParams(second, 'setVisibility')).toHaveLength(1);
    expect(commandParams(second, 'setTheme')).toHaveLength(1);
    // The first mount's bridge would otherwise answer the same event.
    expect(commandParams(first, 'setVisibility')).toHaveLength(0);
  });

  it('destroy() after a re-mount leaves nothing behind', async () => {
    const chat = await mountedChat();
    await remount(chat);

    chat.destroy();

    expect(document.body.querySelectorAll('iframe')).toHaveLength(0);
  });
});

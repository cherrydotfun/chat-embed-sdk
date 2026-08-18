/**
 * `setLayout()` must merge into `config.layout` the way `setTheme()` does: the
 * `ready` re-handshake replays only `config.layout` after an iframe reload.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CherryEmbed } from '../embed';
import { createEmbedIframe } from '../iframe';
import type { BridgeCommand } from '../types';

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

/** Dispatches a cherry:event from the embed origin. */
function dispatchEmbedEvent(eventName: string, data?: unknown): void {
  const msg = { type: 'cherry:event', event: eventName, data };
  window.dispatchEvent(new MessageEvent('message', { data: msg, origin: EMBED_ORIGIN }));
}

/** The iframe created by the mocked factory during mount(). */
function mountedIframe(): HTMLIFrameElement {
  return vi.mocked(createEmbedIframe).mock.results[0]!.value as HTMLIFrameElement;
}

/** Params of every command with `method` posted to the iframe, in order. */
function commandParams(iframe: HTMLIFrameElement, method: string): unknown[] {
  return vi
    .mocked(iframe.contentWindow!.postMessage)
    .mock.calls.map((call) => call[0] as BridgeCommand)
    .filter((msg) => msg.type === 'cherry:cmd' && msg.method === method)
    .map((msg) => msg.params);
}

/**
 * Registered at creation, not at the end of a test body: a failing assertion
 * must not leave a live window listener for the tests after it.
 */
const cleanups: Array<() => void> = [];

/** Mounts against the mocked iframe factory and settles the first handshake. */
async function mountedChat(config?: Partial<ConstructorParameters<typeof CherryEmbed>[0]>) {
  const chat = new CherryEmbed({
    appId: 'app-layout',
    container: document.createElement('div'),
    ...config,
  });
  cleanups.push(() => chat.destroy());
  const mountPromise = chat.mount();
  dispatchEmbedEvent('ready');
  await mountPromise;
  return chat;
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  vi.clearAllMocks();
});

describe('CherryEmbed — setLayout replay across an iframe reload', () => {
  it('replays the merged layout on the next ready handshake', async () => {
    const chat = await mountedChat({ layout: { showMemberCount: true } });

    chat.setLayout({ showHeader: false });

    const iframe = mountedIframe();
    vi.mocked(iframe.contentWindow!.postMessage).mockClear();
    // The iframe reloaded itself (sign-in / wallet switch) and re-handshakes.
    dispatchEmbedEvent('ready');

    expect(commandParams(iframe, 'setLayout')).toEqual([
      { showMemberCount: true, showHeader: false },
    ]);
  });

  it('replays a layout set only via setLayout (none passed at construction)', async () => {
    const chat = await mountedChat();

    chat.setLayout({ showHeader: false });

    const iframe = mountedIframe();
    vi.mocked(iframe.contentWindow!.postMessage).mockClear();
    dispatchEmbedEvent('ready');

    expect(commandParams(iframe, 'setLayout')).toEqual([{ showHeader: false }]);
  });

  it('keeps fields from earlier setLayout calls', async () => {
    const chat = await mountedChat();

    chat.setLayout({ showHeader: false });
    chat.setLayout({ showInput: false });

    const iframe = mountedIframe();
    vi.mocked(iframe.contentWindow!.postMessage).mockClear();
    dispatchEmbedEvent('ready');

    expect(commandParams(iframe, 'setLayout')).toEqual([
      { showHeader: false, showInput: false },
    ]);
  });

  it('sends only the delta to the live iframe, not the merged layout', async () => {
    const chat = await mountedChat({ layout: { showMemberCount: true } });

    const iframe = mountedIframe();
    vi.mocked(iframe.contentWindow!.postMessage).mockClear();
    chat.setLayout({ showHeader: false });

    expect(commandParams(iframe, 'setLayout')).toEqual([{ showHeader: false }]);
  });
});

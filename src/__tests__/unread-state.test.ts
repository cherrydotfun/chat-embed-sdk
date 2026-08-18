/**
 * Unread-indicator surface: `unreadState` forwarding + the cache behind
 * `getUnreadState()`, `setVisibility` reporting, `refreshUnreadState()`.
 *
 * Event tests use a real bridge fed by window messages (mode.test.ts pattern);
 * command tests inject a stub bridge (embed-wallet-address.test.ts pattern).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CherryEmbed } from '../embed';
import { EmbedBridge } from '../bridge';
import { createEmbedIframe } from '../iframe';
import type { BridgeCommand, EmbedEventMap, UnreadState } from '../types';

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

const SNAPSHOT: UnreadState = {
  rooms: [
    { roomId: 'room-a', unread: 3, mentions: 1 },
    { roomId: 'room-b', unread: 4, mentions: 0 },
  ],
  total: { unread: 7, mentions: 1 },
};

/** Dispatches a cherry:event from the embed origin. */
function dispatchEmbedEvent(eventName: string, data?: unknown): void {
  const msg = { type: 'cherry:event', event: eventName, data };
  window.dispatchEvent(new MessageEvent('message', { data: msg, origin: EMBED_ORIGIN }));
}

/** Fake iframe whose postMessage calls we can inspect. */
function createFakeIframe(): HTMLIFrameElement {
  return {
    contentWindow: { postMessage: vi.fn() },
  } as unknown as HTMLIFrameElement;
}

/** The iframe created by the mocked factory during mount(). */
function mountedIframe(): HTMLIFrameElement {
  return vi.mocked(createEmbedIframe).mock.results[0]!.value as HTMLIFrameElement;
}

/** setVisibility params posted to the iframe, in order. */
function visibilityParams(iframe: HTMLIFrameElement): unknown[] {
  return vi
    .mocked(iframe.contentWindow!.postMessage)
    .mock.calls.map((call) => call[0] as BridgeCommand)
    .filter((msg) => msg.type === 'cherry:cmd' && msg.method === 'setVisibility')
    .map((msg) => msg.params);
}

/**
 * Registered at creation, not at the end of a test body: a failing assertion
 * must not leave a live window listener for the tests after it.
 */
const cleanups: Array<() => void> = [];

/** CherryEmbed wired to a real bridge listening on the embed origin. */
function embedWithBridge(config?: Partial<ConstructorParameters<typeof CherryEmbed>[0]>) {
  const chat = new CherryEmbed({
    appId: 'app-unread',
    container: document.createElement('div'),
    ...config,
  });
  const bridge = new EmbedBridge(createFakeIframe(), EMBED_ORIGIN);
  (chat as unknown as { bridge: EmbedBridge }).bridge = bridge;
  (chat as unknown as { setupEventForwarding: () => void }).setupEventForwarding();
  cleanups.push(() => bridge.destroy());
  return { chat, bridge };
}

/** Mounts against the mocked iframe factory and settles the first handshake. */
async function mountedChat(
  config?: Partial<ConstructorParameters<typeof CherryEmbed>[0]>,
  beforeMount?: (chat: CherryEmbed) => void,
): Promise<CherryEmbed> {
  const chat = new CherryEmbed({
    appId: 'app-mount',
    container: document.createElement('div'),
    ...config,
  });
  cleanups.push(() => chat.destroy());
  beforeMount?.(chat);
  const mountPromise = chat.mount();
  dispatchEmbedEvent('ready');
  await mountPromise;
  return chat;
}

/** CherryEmbed wired to a stub bridge that only records commands. */
function embedWithStubBridge(config?: Partial<ConstructorParameters<typeof CherryEmbed>[0]>) {
  const sendCommand = vi.fn();
  const chat = new CherryEmbed({
    appId: 'app-unread',
    container: document.createElement('div'),
    ...config,
  });
  (chat as unknown as { bridge: { sendCommand: typeof sendCommand } }).bridge = { sendCommand };
  return { chat, sendCommand };
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// unreadState event + cache
// ---------------------------------------------------------------------------

describe('CherryEmbed — unreadState event forwarding', () => {
  it('forwards the payload to on("unreadState") listeners', () => {
    const { chat } = embedWithBridge();

    const callback = vi.fn<(data: EmbedEventMap['unreadState']) => void>();
    chat.on('unreadState', callback);

    dispatchEmbedEvent('unreadState', SNAPSHOT);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(SNAPSHOT);
  });

  it('off("unreadState", cb) stops the listener', () => {
    const { chat } = embedWithBridge();

    const callback = vi.fn<(data: EmbedEventMap['unreadState']) => void>();
    chat.on('unreadState', callback);
    chat.off('unreadState', callback);

    dispatchEmbedEvent('unreadState', SNAPSHOT);

    expect(callback).not.toHaveBeenCalled();
  });

  it('keeps forwarding the legacy unreadCount event', () => {
    const { chat } = embedWithBridge();

    const callback = vi.fn<(data: EmbedEventMap['unreadCount']) => void>();
    chat.on('unreadCount', callback);

    dispatchEmbedEvent('unreadCount', 5);

    expect(callback).toHaveBeenCalledWith(5);
  });
});

describe('CherryEmbed — unread cache getters', () => {
  it('returns null / 0 before the first snapshot arrives', () => {
    const { chat } = embedWithBridge();

    expect(chat.getUnreadState()).toBeNull();
    expect(chat.getUnreadCount()).toBe(0);
    expect(chat.getUnreadCount('room-a')).toBe(0);
  });

  it('caches the snapshot and totals the unread messages', () => {
    const { chat } = embedWithBridge();

    dispatchEmbedEvent('unreadState', SNAPSHOT);

    expect(chat.getUnreadState()).toEqual(SNAPSHOT);
    expect(chat.getUnreadCount()).toBe(7);
  });

  it('reads per-room counts and returns 0 for unknown rooms', () => {
    const { chat } = embedWithBridge();

    dispatchEmbedEvent('unreadState', SNAPSHOT);

    expect(chat.getUnreadCount('room-a')).toBe(3);
    expect(chat.getUnreadCount('room-b')).toBe(4);
    expect(chat.getUnreadCount('room-missing')).toBe(0);
  });

  it('replaces the cache with the latest snapshot', () => {
    const { chat } = embedWithBridge();

    dispatchEmbedEvent('unreadState', SNAPSHOT);
    dispatchEmbedEvent('unreadState', {
      rooms: [{ roomId: 'room-a', unread: 0, mentions: 0 }],
      total: { unread: 0, mentions: 0 },
    } satisfies UnreadState);

    expect(chat.getUnreadCount()).toBe(0);
    expect(chat.getUnreadCount('room-a')).toBe(0);
    expect(chat.getUnreadState()?.rooms).toHaveLength(1);
  });

  it('accepts an empty rooms array (session before the room join resolves)', () => {
    const { chat } = embedWithBridge();

    dispatchEmbedEvent('unreadState', SNAPSHOT);
    dispatchEmbedEvent('unreadState', { rooms: [], total: { unread: 0, mentions: 0 } } satisfies UnreadState);

    expect(chat.getUnreadState()?.rooms).toEqual([]);
    expect(chat.getUnreadCount()).toBe(0);
    expect(chat.getUnreadCount('room-a')).toBe(0);
  });

  it('drops the cache on destroy()', () => {
    const { chat } = embedWithBridge();

    dispatchEmbedEvent('unreadState', SNAPSHOT);
    expect(chat.getUnreadCount()).toBe(7);

    chat.destroy();

    expect(chat.getUnreadState()).toBeNull();
    expect(chat.getUnreadCount()).toBe(0);
  });

  it('drops the cache on signOut()', () => {
    const { chat } = embedWithBridge();

    dispatchEmbedEvent('unreadState', SNAPSHOT);
    expect(chat.getUnreadCount()).toBe(7);

    chat.signOut();

    // Nothing is emitted for a signed-out viewer, so a surviving snapshot
    // would serve pre-logout counts forever — refreshUnreadState() included.
    expect(chat.getUnreadState()).toBeNull();
    expect(chat.getUnreadCount()).toBe(0);
    expect(chat.getUnreadCount('room-a')).toBe(0);
  });

  it('drops malformed payloads instead of poisoning the cache or listeners', () => {
    const { chat } = embedWithBridge();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cleanups.push(() => warn.mockRestore());

    const callback = vi.fn<(data: EmbedEventMap['unreadState']) => void>();
    chat.on('unreadState', callback);

    dispatchEmbedEvent('unreadState', SNAPSHOT);
    dispatchEmbedEvent('unreadState', { rooms: 'nope', total: null });
    dispatchEmbedEvent('unreadState', { rooms: [{ roomId: 'room-a' }], total: { unread: 1, mentions: 0 } });

    // Cache still holds the last well-formed snapshot…
    expect(chat.getUnreadState()).toEqual(SNAPSHOT);
    expect(chat.getUnreadCount()).toBe(7);
    // …and callbacks typed UnreadState never saw the junk that would throw
    // inside them.
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(SNAPSHOT);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Account switches
// ---------------------------------------------------------------------------

describe('CherryEmbed — unread cache across account switches', () => {
  it('setToken() drops the previous viewer’s counts', () => {
    const { chat } = embedWithBridge();

    dispatchEmbedEvent('unreadState', SNAPSHOT);
    // The documented walletConnectRequested → setToken flow can land on a
    // different account; those counts must not survive the switch.
    chat.setToken('token-2');

    expect(chat.getUnreadState()).toBeNull();
    expect(chat.getUnreadCount()).toBe(0);
  });

  it('setWalletAddress() drops them when the wallet actually changes', () => {
    const { chat } = embedWithBridge({ walletAddress: 'wallet-a' });

    dispatchEmbedEvent('unreadState', SNAPSHOT);
    chat.setWalletAddress('wallet-b');

    expect(chat.getUnreadState()).toBeNull();
    expect(chat.getUnreadCount()).toBe(0);
  });

  it('keeps them when the same wallet is re-sent', () => {
    const { chat } = embedWithBridge({ walletAddress: 'wallet-a' });

    dispatchEmbedEvent('unreadState', SNAPSHOT);
    chat.setWalletAddress('wallet-a');

    expect(chat.getUnreadState()).toEqual(SNAPSHOT);
    expect(chat.getUnreadCount()).toBe(7);
  });

  it('keeps them when the host names the wallet for the first time', () => {
    const { chat } = embedWithBridge();

    dispatchEmbedEvent('unreadState', SNAPSHOT);
    chat.setWalletAddress('wallet-a');

    expect(chat.getUnreadState()).toEqual(SNAPSHOT);
    expect(chat.getUnreadCount()).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// setVisibility commands
// ---------------------------------------------------------------------------

describe('CherryEmbed — visibility reporting', () => {
  it('hide() reports visible:false and show() reports visible:true', () => {
    const { chat, sendCommand } = embedWithStubBridge();

    chat.hide();
    expect(sendCommand).toHaveBeenLastCalledWith('setVisibility', { visible: false });
    expect(chat.isVisible).toBe(false);

    chat.show();
    expect(sendCommand).toHaveBeenLastCalledWith('setVisibility', { visible: true });
    expect(chat.isVisible).toBe(true);
  });

  it('toggle() alternates the reported visibility', () => {
    const { chat, sendCommand } = embedWithStubBridge();

    chat.toggle();
    chat.toggle();

    expect(sendCommand.mock.calls).toEqual([
      ['setVisibility', { visible: false }],
      ['setVisibility', { visible: true }],
    ]);
  });

  it('toggle() opens first when the widget mounted collapsed', () => {
    const { chat, sendCommand } = embedWithStubBridge({ collapsed: true });

    expect(chat.isVisible).toBe(false);
    chat.toggle();

    expect(sendCommand).toHaveBeenLastCalledWith('setVisibility', { visible: true });
  });

  it('sends visible:true in the init handshake by default', () => {
    const { chat, sendCommand } = embedWithStubBridge();

    (chat as unknown as { sendInitConfigs: () => void }).sendInitConfigs();

    expect(sendCommand).toHaveBeenCalledWith('setVisibility', { visible: true });
  });

  it('sends visible:false in the init handshake when collapsed', () => {
    const { chat, sendCommand } = embedWithStubBridge({ collapsed: true });

    (chat as unknown as { sendInitConfigs: () => void }).sendInitConfigs();

    expect(sendCommand).toHaveBeenCalledWith('setVisibility', { visible: false });
  });

  it('replays the current visibility on a later handshake (iframe reload)', () => {
    const { chat, sendCommand } = embedWithStubBridge();

    chat.hide();
    sendCommand.mockClear();
    (chat as unknown as { sendInitConfigs: () => void }).sendInitConfigs();

    expect(sendCommand).toHaveBeenCalledWith('setVisibility', { visible: false });
  });

  it('posts setVisibility to the iframe after mount, once ready', async () => {
    await mountedChat({ collapsed: true });

    expect(visibilityParams(mountedIframe())).toEqual([{ visible: false }]);
  });

  it('a plain mount renders visible and reports visible:true', async () => {
    const chat = await mountedChat();

    const iframe = mountedIframe();
    expect(iframe.style.display).toBeUndefined();
    expect(chat.isVisible).toBe(true);
    expect(visibilityParams(iframe)).toEqual([{ visible: true }]);
  });

  it('honours a hide() before mount: starts hidden, reports visible:false', async () => {
    // No iframe yet, so hide() is CSS-less — mount() must pick it up, or the
    // widget renders visible while reporting visible:false.
    const chat = await mountedChat(undefined, (c) => c.hide());

    const iframe = mountedIframe();
    expect(iframe.style.display).toBe('none');
    expect(chat.isVisible).toBe(false);
    expect(visibilityParams(iframe)).toEqual([{ visible: false }]);
  });

  it('honours a show() before mount on a collapsed widget', async () => {
    const chat = await mountedChat({ collapsed: true }, (c) => c.show());

    const iframe = mountedIframe();
    expect(iframe.style.display).toBeUndefined();
    expect(chat.isVisible).toBe(true);
    expect(visibilityParams(iframe)).toEqual([{ visible: true }]);
  });
});

// ---------------------------------------------------------------------------
// refreshUnreadState
// ---------------------------------------------------------------------------

describe('CherryEmbed — refreshUnreadState', () => {
  it('sends the requestUnreadState command', () => {
    const { chat, sendCommand } = embedWithStubBridge();

    chat.refreshUnreadState();

    expect(sendCommand).toHaveBeenCalledWith('requestUnreadState', {});
  });

  it('is a no-op before mount', () => {
    const chat = new CherryEmbed({
      appId: 'app-unmounted',
      container: document.createElement('div'),
    });

    expect(() => chat.refreshUnreadState()).not.toThrow();
    expect(chat.getUnreadState()).toBeNull();
  });
});

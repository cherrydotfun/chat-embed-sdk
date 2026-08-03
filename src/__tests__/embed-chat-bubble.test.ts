/**
 * Tests for the opt-in `chatBubble` launcher.
 *
 * `createEmbedIframe` is mocked (jsdom has no `iframe.sandbox` DOMTokenList),
 * so the real floating styles are asserted against `applyFloatingStyles`
 * directly. jsdom's CSS parser drops `min()` / `max()` / `env()` values, so the
 * launcher pose is asserted through aria state + icon, not `style.bottom`.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CherryEmbed } from '../embed';
import { applyFloatingStyles } from '../iframe';

vi.mock('../iframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../iframe')>();
  return {
    ...actual,
    createEmbedIframe: vi.fn(() => {
      const fakeIframe = {
        style: {} as CSSStyleDeclaration,
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

/** Mounts and resolves the ready-wait so `mount()` settles. */
async function mountEmbed(config: ConstructorParameters<typeof CherryEmbed>[0]): Promise<CherryEmbed> {
  const chat = new CherryEmbed(config);
  const mounting = chat.mount();
  dispatchEmbedEvent('ready');
  await mounting;
  return chat;
}

function bubbles(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'));
}

function bubble(): HTMLButtonElement {
  const found = bubbles();
  expect(found).toHaveLength(1);
  return found[0]!;
}

/** The fake iframe's inline style object — a bare `{}` until the SDK writes to it. */
function iframeStyle(chat: CherryEmbed): { zIndex?: string; display?: string; opacity?: string } {
  return (chat as unknown as { iframe: HTMLIFrameElement }).iframe.style;
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('chatBubble — default off', () => {
  it('renders no launcher when the option is omitted', async () => {
    const chat = await mountEmbed({ appId: 'a1', position: 'floating-right' });
    expect(bubbles()).toHaveLength(0);
    chat.destroy();
  });

  it('renders no launcher when explicitly false', async () => {
    const chat = await mountEmbed({ appId: 'a2', position: 'floating-left', chatBubble: false });
    expect(bubbles()).toHaveLength(0);
    chat.destroy();
  });

  it('leaves the iframe z-index untouched by the SDK when disabled', async () => {
    const chat = await mountEmbed({ appId: 'a3', position: 'floating-right' });
    expect(iframeStyle(chat).zIndex).toBeUndefined();
    chat.destroy();
  });

  it('applyFloatingStyles still pins the iframe to the max z-index', () => {
    const iframe = document.createElement('iframe');
    applyFloatingStyles(iframe, 'floating-right');
    expect(iframe.style.zIndex).toBe('2147483647');
    expect(iframe.style.bottom).toBe('20px');
    expect(iframe.style.right).toBe('20px');
    expect(iframe.style.width).toBe('380px');
    expect(iframe.style.height).toBe('520px');
    expect(iframe.style.maxWidth).toBe('calc(100vw - 40px)');
    expect(iframe.style.maxHeight).toBe('calc(100vh - 40px)');
  });

  it('ignores chatBubble for inline embeds', async () => {
    const chat = await mountEmbed({
      appId: 'a4',
      container: document.createElement('div'),
      chatBubble: true,
    });
    expect(bubbles()).toHaveLength(0);
    expect(iframeStyle(chat).zIndex).toBeUndefined();
    chat.destroy();
  });
});

describe('chatBubble — mount and placement', () => {
  it('appends a round button to document.body for floating-right', async () => {
    const chat = await mountEmbed({ appId: 'b1', position: 'floating-right', chatBubble: true });
    const el = bubble();
    expect(el.parentElement).toBe(document.body);
    expect(el.type).toBe('button');
    expect(el.style.position).toBe('fixed');
    expect(el.style.width).toBe('56px');
    expect(el.style.height).toBe('56px');
    expect(el.style.borderRadius).toBe('50%');
    expect(el.style.right).toBe('20px');
    expect(el.style.left).toBe('');
    chat.destroy();
  });

  it('anchors to the left for floating-left', async () => {
    const chat = await mountEmbed({ appId: 'b2', position: 'floating-left', chatBubble: true });
    const el = bubble();
    expect(el.style.left).toBe('20px');
    expect(el.style.right).toBe('');
    chat.destroy();
  });

  it('puts the launcher above the panel in the stacking order', async () => {
    const chat = await mountEmbed({ appId: 'b3', position: 'floating-right', chatBubble: true });
    expect(bubble().style.zIndex).toBe('2147483647');
    expect(iframeStyle(chat).zIndex).toBe('2147483646');
    chat.destroy();
  });

  it('transitions transform and bottom, and carries a shadow', async () => {
    const chat = await mountEmbed({ appId: 'b4', position: 'floating-right', chatBubble: true });
    const el = bubble();
    expect(el.style.transition).toBe('transform 0.2s, bottom 0.2s');
    expect(el.style.boxShadow).not.toBe('');
    chat.destroy();
  });

  it('does not leave two launchers when mount() runs twice', async () => {
    const chat = new CherryEmbed({ appId: 'b5', position: 'floating-right', chatBubble: true });
    const first = chat.mount();
    dispatchEmbedEvent('ready');
    await first;
    const second = chat.mount();
    dispatchEmbedEvent('ready');
    await second;
    expect(bubbles()).toHaveLength(1);
    chat.destroy();
  });
});

describe('chatBubble — pose follows visibility', () => {
  it('starts in the open pose when not collapsed', async () => {
    const chat = await mountEmbed({ appId: 'c1', position: 'floating-right', chatBubble: true });
    const el = bubble();
    expect(el.getAttribute('aria-expanded')).toBe('true');
    expect(el.getAttribute('aria-label')).toBe('Close chat');
    expect(chat.isVisible).toBe(true);
    chat.destroy();
  });

  it('starts in the closed pose with collapsed: true', async () => {
    const chat = await mountEmbed({
      appId: 'c2',
      position: 'floating-right',
      chatBubble: true,
      collapsed: true,
    });
    const el = bubble();
    expect(el.getAttribute('aria-expanded')).toBe('false');
    expect(el.getAttribute('aria-label')).toBe('Open chat');
    expect(el.style.bottom).toBe('20px'); // jsdom drops the max()/env() upgrade
    expect(chat.isVisible).toBe(false);
    chat.destroy();
  });

  it('swaps the icon between poses', async () => {
    const chat = await mountEmbed({
      appId: 'c3',
      position: 'floating-right',
      chatBubble: true,
      collapsed: true,
    });
    const el = bubble();
    const closedIcon = el.innerHTML;
    expect(closedIcon).toContain('<svg');
    el.click();
    expect(el.innerHTML).toContain('<svg');
    expect(el.innerHTML).not.toBe(closedIcon);
    chat.destroy();
  });

  it('click toggles panel visibility and the launcher pose', async () => {
    const chat = await mountEmbed({
      appId: 'c4',
      position: 'floating-right',
      chatBubble: true,
      collapsed: true,
    });
    const el = bubble();
    const style = iframeStyle(chat);

    el.click();
    expect(chat.isVisible).toBe(true);
    expect(style.display).toBe('block');
    expect(style.opacity).toBe('1');
    expect(el.getAttribute('aria-expanded')).toBe('true');
    expect(el.getAttribute('aria-label')).toBe('Close chat');

    el.click();
    expect(chat.isVisible).toBe(false);
    expect(style.opacity).toBe('0');
    expect(el.getAttribute('aria-expanded')).toBe('false');
    expect(el.getAttribute('aria-label')).toBe('Open chat');

    chat.destroy();
  });

  it('host hide() / show() / toggle() re-pose the launcher too', async () => {
    const chat = await mountEmbed({ appId: 'c5', position: 'floating-right', chatBubble: true });
    const el = bubble();

    chat.hide();
    expect(el.getAttribute('aria-expanded')).toBe('false');

    chat.show();
    expect(el.getAttribute('aria-expanded')).toBe('true');

    chat.toggle();
    expect(el.getAttribute('aria-expanded')).toBe('false');

    chat.toggle();
    expect(el.getAttribute('aria-expanded')).toBe('true');

    chat.destroy();
  });
});

describe('chatBubble — theming', () => {
  it('falls back to the brand pink with no theme', async () => {
    const chat = await mountEmbed({ appId: 'd1', position: 'floating-right', chatBubble: true });
    // jsdom normalises hex to rgb(): #ff5ba8 -> rgb(255, 91, 168).
    expect(bubble().style.background).toBe('rgb(255, 91, 168)');
    chat.destroy();
  });

  it('uses a plain ownBubbleColor as a flat fill', async () => {
    const chat = await mountEmbed({
      appId: 'd2',
      position: 'floating-right',
      chatBubble: true,
      theme: { ownBubbleColor: '#101020' },
    });
    expect(bubble().style.background).toBe('rgb(16, 16, 32)');
    chat.destroy();
  });

  it('builds a primary→accent gradient when ownBubbleColor is absent', async () => {
    const chat = await mountEmbed({
      appId: 'd3',
      position: 'floating-right',
      chatBubble: true,
      theme: { primaryColor: '#112233', accentColor: '#445566' },
    });
    const bg = bubble().style.background;
    expect(bg).toContain('linear-gradient(135deg');
    expect(bg).toContain('rgb(17, 34, 51)');
    expect(bg).toContain('rgb(68, 85, 102)');
    chat.destroy();
  });

  it('skips an ownBubbleColor that already carries a gradient', async () => {
    const chat = await mountEmbed({
      appId: 'd4',
      position: 'floating-right',
      chatBubble: true,
      theme: { ownBubbleColor: 'linear-gradient(90deg, #000 0%, #fff 100%)', primaryColor: '#112233' },
    });
    const bg = bubble().style.background;
    expect(bg).toContain('linear-gradient(135deg');
    expect(bg).toContain('rgb(17, 34, 51)');
    chat.destroy();
  });

  it('picks dark ink on a light fill and white on a dark one', async () => {
    const light = await mountEmbed({
      appId: 'd5',
      position: 'floating-right',
      chatBubble: true,
      theme: { ownBubbleColor: '#ffffff' },
    });
    expect(bubble().style.color).toBe('rgb(17, 17, 17)');
    light.destroy();

    const dark = await mountEmbed({
      appId: 'd6',
      position: 'floating-right',
      chatBubble: true,
      theme: { ownBubbleColor: '#000000' },
    });
    expect(bubble().style.color).toBe('rgb(255, 255, 255)');
    dark.destroy();
  });

  it('honours an explicit ownBubbleTextColor', async () => {
    const chat = await mountEmbed({
      appId: 'd7',
      position: 'floating-right',
      chatBubble: true,
      theme: { ownBubbleColor: '#ffffff', ownBubbleTextColor: '#ff0000' },
    });
    expect(bubble().style.color).toBe('rgb(255, 0, 0)');
    chat.destroy();
  });

  it('setTheme restyles the fill', async () => {
    const chat = await mountEmbed({ appId: 'd8', position: 'floating-right', chatBubble: true });
    expect(bubble().style.background).toBe('rgb(255, 91, 168)');
    chat.setTheme({ ownBubbleColor: '#00ff00' });
    expect(bubble().style.background).toBe('rgb(0, 255, 0)');
    chat.destroy();
  });

  it('resetTheme falls back to the brand fill', async () => {
    const chat = await mountEmbed({
      appId: 'd9',
      position: 'floating-right',
      chatBubble: true,
      theme: { ownBubbleColor: '#00ff00' },
    });
    expect(bubble().style.background).toBe('rgb(0, 255, 0)');
    chat.resetTheme();
    expect(bubble().style.background).toBe('rgb(255, 91, 168)');
    expect(bubble().style.color).toBe('rgb(255, 255, 255)');
    chat.destroy();
  });
});

describe('chatBubble — teardown', () => {
  it('destroy() removes the launcher', async () => {
    const chat = await mountEmbed({ appId: 'e1', position: 'floating-right', chatBubble: true });
    expect(bubbles()).toHaveLength(1);
    chat.destroy();
    expect(bubbles()).toHaveLength(0);
  });

  it('repeated destroy() is safe', async () => {
    const chat = await mountEmbed({ appId: 'e2', position: 'floating-right', chatBubble: true });
    chat.destroy();
    expect(() => chat.destroy()).not.toThrow();
    expect(bubbles()).toHaveLength(0);
  });

  it('a destroyed launcher no longer toggles the instance', async () => {
    const chat = await mountEmbed({ appId: 'e3', position: 'floating-right', chatBubble: true });
    const el = bubble();
    chat.destroy();
    el.click();
    expect(chat.isVisible).toBe(true); // untouched by the detached button
  });

  it('survives a mount() that rejects on the ready timeout — launcher stays', async () => {
    vi.useFakeTimers();
    const chat = new CherryEmbed({ appId: 'e4', position: 'floating-right', chatBubble: true });
    const mounting = chat.mount();
    const settled = expect(mounting).rejects.toThrow('iframe ready timeout');
    await vi.advanceTimersByTimeAsync(30_000);
    await settled;
    expect(bubbles()).toHaveLength(1);
    // hide() still works after the rejection.
    chat.hide();
    expect(bubble().getAttribute('aria-expanded')).toBe('false');
    chat.destroy();
    expect(bubbles()).toHaveLength(0);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Unread / mention badge — the "Cherry-recommended UI" from the embed docs.
// ---------------------------------------------------------------------------

/** Builds an `unreadState` payload for the single room the embed renders. */
function snapshot(unread: number, mentions: number) {
  return { rooms: [{ roomId: 'room-1', unread, mentions }], total: { unread, mentions } };
}

function badge(): HTMLElement {
  const el = bubble().querySelector<HTMLElement>('[data-cherry-badge]');
  expect(el).not.toBeNull();
  return el!;
}

/** Rendered pill text, `@` included when the mention state is on. */
function badgeText(): string {
  const el = badge();
  const at = el.querySelector<HTMLElement>('[data-cherry-badge-at]')!;
  const num = el.querySelector<HTMLElement>('[data-cherry-badge-n]')!;
  return (at.style.display === 'none' ? '' : '@') + (num.textContent ?? '');
}

function badgeVisible(): boolean {
  return !badge().hidden && badge().style.display !== 'none';
}

describe('chatBubble — unread badge', () => {
  it('carries exactly one badge element, hidden at zero', async () => {
    const chat = await mountEmbed({ appId: 'f1', position: 'floating-right', chatBubble: true });
    expect(bubble().querySelectorAll('[data-cherry-badge]')).toHaveLength(1);
    expect(badgeVisible()).toBe(false);
    chat.destroy();
  });

  // Size, padding and the centre-anchored offsets are the mode's call —
  // asserted in the badge-mode and anchoring suites.
  it('matches the documented badge style', async () => {
    const chat = await mountEmbed({ appId: 'f2', position: 'floating-right', chatBubble: true });
    const el = badge();
    expect(el.style.position).toBe('absolute');
    expect(el.style.borderRadius).toBe('999px');
    expect(el.style.background).toBe('rgb(255, 20, 147)'); // #ff1493
    expect(el.style.color).toBe('rgb(255, 255, 255)');
    // The gap lives on the inner row, which is what holds the glyph/digit pair.
    expect(el.querySelector<HTMLElement>('[data-cherry-badge-row]')!.style.gap).toBe('3px');
    expect(el.style.boxShadow).toContain('var(--cherry-bubble-badge-ring, #ffffff)');
    chat.destroy();
  });

  it('shows the unread count with no "@" when there are no mentions', async () => {
    const chat = await mountEmbed({ appId: 'f3', position: 'floating-right', chatBubble: true, chatBubbleBadge: 'count' });
    dispatchEmbedEvent('unreadState', snapshot(7, 0));
    expect(badgeVisible()).toBe(true);
    expect(badgeText()).toBe('7');
    chat.destroy();
  });

  it('flags mentions with "@" but still numbers the unread count', async () => {
    const chat = await mountEmbed({ appId: 'f4', position: 'floating-right', chatBubble: true, chatBubbleBadge: 'count' });
    dispatchEmbedEvent('unreadState', snapshot(7, 2));
    expect(badgeText()).toBe('@7'); // the 2 mentions are never rendered
    chat.destroy();
  });

  it('never renders the mention tally as the number', async () => {
    const chat = await mountEmbed({ appId: 'f4b', position: 'floating-right', chatBubble: true, chatBubbleBadge: 'count' });
    dispatchEmbedEvent('unreadState', snapshot(125, 9));
    expect(badgeText()).toBe('@99+'); // 125 unread capped, not the 9 mentions
    chat.destroy();
  });

  it('leaves a bare "@" when a mention outlives the unread count', async () => {
    const chat = await mountEmbed({ appId: 'f5', position: 'floating-right', chatBubble: true, chatBubbleBadge: 'count' });
    dispatchEmbedEvent('unreadState', snapshot(7, 2));
    expect(badgeText()).toBe('@7');
    dispatchEmbedEvent('unreadState', snapshot(0, 2));
    expect(badgeVisible()).toBe(true);
    expect(badgeText()).toBe('@'); // unread is 0, so no number at all
    chat.destroy();
  });

  it('caps the number at 99+', async () => {
    const chat = await mountEmbed({ appId: 'f6', position: 'floating-right', chatBubble: true, chatBubbleBadge: 'count' });
    dispatchEmbedEvent('unreadState', snapshot(99, 0));
    expect(badgeText()).toBe('99');
    dispatchEmbedEvent('unreadState', snapshot(120, 0));
    expect(badgeText()).toBe('99+');
    dispatchEmbedEvent('unreadState', snapshot(120, 150));
    expect(badgeText()).toBe('@99+'); // still the unread cap, not the mentions
    dispatchEmbedEvent('unreadState', snapshot(0, 150));
    expect(badgeText()).toBe('@'); // nothing unread left to number
    chat.destroy();
  });

  it('hides again when the counters drop back to zero', async () => {
    const chat = await mountEmbed({ appId: 'f7', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(4, 0));
    expect(badgeVisible()).toBe(true);
    dispatchEmbedEvent('unreadState', snapshot(0, 0));
    expect(badgeVisible()).toBe(false);
    chat.destroy();
  });

  it('clears on authStateChange(false)', async () => {
    const chat = await mountEmbed({ appId: 'f8', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(5, 3));
    expect(badgeVisible()).toBe(true);
    dispatchEmbedEvent('authStateChange', false);
    expect(badgeVisible()).toBe(false);
    chat.destroy();
  });

  it('leaves the badge alone on authStateChange(true)', async () => {
    const chat = await mountEmbed({ appId: 'f9', position: 'floating-right', chatBubble: true, chatBubbleBadge: 'count' });
    dispatchEmbedEvent('unreadState', snapshot(5, 0));
    dispatchEmbedEvent('authStateChange', true);
    expect(badgeVisible()).toBe(true);
    expect(badgeText()).toBe('5');
    chat.destroy();
  });

  it('seeds from the cached snapshot on remount', async () => {
    const chat = await mountEmbed({ appId: 'f10', position: 'floating-right', chatBubble: true, chatBubbleBadge: 'count' });
    dispatchEmbedEvent('authStateChange', true); // counts only ever reach a signed-in viewer
    dispatchEmbedEvent('unreadState', snapshot(8, 3));
    expect(badgeText()).toBe('@8');

    const remounting = chat.mount();
    dispatchEmbedEvent('ready');
    await remounting;

    // A fresh button, already carrying the cached counts.
    expect(bubbles()).toHaveLength(1);
    expect(badgeVisible()).toBe(true);
    expect(badgeText()).toBe('@8');
    chat.destroy();
  });

  it('ignores a malformed unreadState payload', async () => {
    const chat = await mountEmbed({ appId: 'f11', position: 'floating-right', chatBubble: true, chatBubbleBadge: 'count' });
    dispatchEmbedEvent('unreadState', snapshot(4, 0));
    dispatchEmbedEvent('unreadState', { rooms: 'nope' });
    expect(badgeText()).toBe('4');
    chat.destroy();
  });

  it('survives a pose toggle', async () => {
    const chat = await mountEmbed({
      appId: 'f12',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
      collapsed: true,
    });
    dispatchEmbedEvent('unreadState', snapshot(4, 6));
    expect(badgeText()).toBe('@4');

    bubble().click(); // open
    expect(bubble().getAttribute('aria-expanded')).toBe('true');
    expect(badgeVisible()).toBe(true);
    expect(badgeText()).toBe('@4');

    bubble().click(); // closed
    expect(badgeVisible()).toBe(true);
    expect(badgeText()).toBe('@4');
    chat.destroy();
  });

  it('keeps the icon swap working alongside the badge', async () => {
    const chat = await mountEmbed({
      appId: 'f13',
      position: 'floating-right',
      chatBubble: true,
      collapsed: true,
    });
    const iconSlot = () => bubble().querySelector<HTMLElement>('[data-cherry-icon]')!;
    const closed = iconSlot().innerHTML;
    expect(closed).toContain('<svg');
    bubble().click();
    expect(iconSlot().innerHTML).toContain('<svg');
    expect(iconSlot().innerHTML).not.toBe(closed);
    chat.destroy();
  });
});

describe('chatBubble — _setBubbleBadge hook', () => {
  it('drives the badge DOM directly', async () => {
    const chat = await mountEmbed({ appId: 'g1', position: 'floating-right', chatBubble: true, chatBubbleBadge: 'count' });
    chat._setBubbleBadge(12, 0);
    expect(badgeText()).toBe('12');
    chat._setBubbleBadge(12, 4);
    expect(badgeText()).toBe('@12'); // the 4 mentions only raise the flag
    chat._setBubbleBadge(120, 0);
    expect(badgeText()).toBe('99+');
    chat._setBubbleBadge(0, 0);
    expect(badgeVisible()).toBe(false);
    chat.destroy();
  });

  it('no-ops without a bubble', async () => {
    const chat = await mountEmbed({ appId: 'g2', position: 'floating-right' });
    expect(() => chat._setBubbleBadge(5, 1)).not.toThrow();
    chat.destroy();
  });

  it('does not touch the unread cache', async () => {
    const chat = await mountEmbed({ appId: 'g3', position: 'floating-right', chatBubble: true, chatBubbleBadge: 'count' });
    chat._setBubbleBadge(9, 2);
    expect(chat.getUnreadState()).toBeNull();
    expect(chat.getUnreadCount()).toBe(0);
    chat.destroy();
  });
});

describe('chatBubble — badge clears on a viewer switch', () => {
  /** Signs a viewer in and parks 3 mentions on the badge. */
  async function withCountedBadge(appId: string, walletAddress = 'wallet-a'): Promise<CherryEmbed> {
    const chat = await mountEmbed({ appId, position: 'floating-right', chatBubble: true, chatBubbleBadge: 'count', walletAddress });
    dispatchEmbedEvent('authStateChange', true);
    dispatchEmbedEvent('unreadState', snapshot(8, 3));
    expect(badgeText()).toBe('@8');
    return chat;
  }

  it('clears when setWalletAddress switches to a different wallet', async () => {
    const chat = await withCountedBadge('h1');
    chat.setWalletAddress('other-wallet');
    expect(badgeVisible()).toBe(false);
    expect(chat.getUnreadState()).toBeNull();
    chat.destroy();
  });

  it('keeps the badge when setWalletAddress repeats the same wallet', async () => {
    const chat = await mountEmbed({
      appId: 'h2',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
      walletAddress: 'wallet-a',
    });
    dispatchEmbedEvent('authStateChange', true);
    dispatchEmbedEvent('unreadState', snapshot(8, 3));
    chat.setWalletAddress('wallet-a');
    expect(badgeText()).toBe('@8');
    chat.destroy();
  });

  it('clears on setToken', async () => {
    const chat = await withCountedBadge('h3');
    chat.setToken('fresh-token');
    expect(badgeVisible()).toBe(false);
    chat.destroy();
  });

  it('clears on signOut', async () => {
    const chat = await withCountedBadge('h4');
    chat.signOut();
    expect(badgeVisible()).toBe(false);
    chat.destroy();
  });

  it('does not resurrect a signed-out badge on remount', async () => {
    const chat = await withCountedBadge('h5');
    // PR#7 keeps the cache on sign-out by design; only the badge clears.
    dispatchEmbedEvent('authStateChange', false);
    expect(badgeVisible()).toBe(false);
    expect(chat.getUnreadState()).not.toBeNull();

    const remounting = chat.mount();
    dispatchEmbedEvent('ready');
    await remounting;

    expect(bubbles()).toHaveLength(1);
    expect(badgeVisible()).toBe(false);
    chat.destroy();
  });

  it('still seeds a remount while the viewer is signed in', async () => {
    const chat = await withCountedBadge('h6');
    const remounting = chat.mount();
    dispatchEmbedEvent('ready');
    await remounting;
    expect(badgeText()).toBe('@8');
    chat.destroy();
  });

  it('carries role=status so count changes are announced', async () => {
    const chat = await mountEmbed({ appId: 'h7', position: 'floating-right', chatBubble: true });
    expect(badge().getAttribute('role')).toBe('status');
    chat.destroy();
  });
});

// ---------------------------------------------------------------------------
// Badge modes: 'dot' (default) | 'count' | 'off'
// ---------------------------------------------------------------------------

/** Badge box size, which distinguishes a bare dot from a glyph-carrying pill. */
function badgeSize(): { minWidth: string; height: string; padding: string } {
  const el = badge();
  return { minWidth: el.style.minWidth, height: el.style.height, padding: el.style.padding };
}

describe('chatBubble — badge mode "dot" (default)', () => {
  it('defaults to dot when chatBubbleBadge is omitted', async () => {
    const chat = await mountEmbed({ appId: 'i1', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(7, 0));
    expect(badgeVisible()).toBe(true);
    expect(badgeText()).toBe(''); // no number, no "@"
    expect(badgeSize()).toEqual({ minWidth: '12px', height: '12px', padding: '0px' });
    chat.destroy();
  });

  it('renders a bare dot regardless of how many messages are unread', async () => {
    const chat = await mountEmbed({
      appId: 'i2',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'dot',
    });
    dispatchEmbedEvent('unreadState', snapshot(150, 0));
    expect(badgeText()).toBe('');
    expect(badgeSize().minWidth).toBe('12px');
    chat.destroy();
  });

  it('upgrades to a lone "@" pill on mentions, with no number', async () => {
    const chat = await mountEmbed({ appId: 'i3', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(9, 4));
    expect(badgeText()).toBe('@');
    expect(badgeSize()).toEqual({ minWidth: '18px', height: '18px', padding: '0px' });
    chat.destroy();
  });

  it('falls back from the "@" pill to the dot when mentions clear', async () => {
    const chat = await mountEmbed({ appId: 'i4', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(9, 4));
    expect(badgeText()).toBe('@');
    dispatchEmbedEvent('unreadState', snapshot(9, 0));
    expect(badgeText()).toBe('');
    expect(badgeSize().minWidth).toBe('12px');
    chat.destroy();
  });

  it('still hides at zero', async () => {
    const chat = await mountEmbed({ appId: 'i5', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(3, 0));
    expect(badgeVisible()).toBe(true);
    dispatchEmbedEvent('unreadState', snapshot(0, 0));
    expect(badgeVisible()).toBe(false);
    chat.destroy();
  });

  it('is respected by _setBubbleBadge', async () => {
    const chat = await mountEmbed({ appId: 'i6', position: 'floating-right', chatBubble: true });
    chat._setBubbleBadge(42, 0);
    expect(badgeText()).toBe(''); // dot mode never numbers
    expect(badgeSize().minWidth).toBe('12px');
    chat._setBubbleBadge(42, 5);
    expect(badgeText()).toBe('@');
    chat.destroy();
  });
});

describe('chatBubble — badge mode "count"', () => {
  it('numbers the pill and keeps the 99+ cap', async () => {
    const chat = await mountEmbed({
      appId: 'j1',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    dispatchEmbedEvent('unreadState', snapshot(7, 0));
    expect(badgeText()).toBe('7');
    expect(badgeSize()).toEqual({ minWidth: '18px', height: '18px', padding: '0px 5px' });
    dispatchEmbedEvent('unreadState', snapshot(120, 0));
    expect(badgeText()).toBe('99+');
    dispatchEmbedEvent('unreadState', snapshot(120, 3));
    expect(badgeText()).toBe('@99+');
    chat.destroy();
  });

  it('is respected by _setBubbleBadge', async () => {
    const chat = await mountEmbed({
      appId: 'j2',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    chat._setBubbleBadge(42, 0);
    expect(badgeText()).toBe('42');
    chat.destroy();
  });
});

describe('chatBubble — badge mode "off"', () => {
  it('builds no badge element at all', async () => {
    const chat = await mountEmbed({
      appId: 'k1',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'off',
    });
    expect(bubbles()).toHaveLength(1); // the launcher itself still renders
    expect(bubble().querySelector('[data-cherry-badge]')).toBeNull();
    chat.destroy();
  });

  it('stays absent when counts arrive', async () => {
    const chat = await mountEmbed({
      appId: 'k2',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'off',
    });
    dispatchEmbedEvent('authStateChange', true);
    dispatchEmbedEvent('unreadState', snapshot(12, 4));
    expect(bubble().querySelector('[data-cherry-badge]')).toBeNull();
    expect(chat.getUnreadCount()).toBe(12); // the cache still tracks them
    chat.destroy();
  });

  it('no-ops through _setBubbleBadge', async () => {
    const chat = await mountEmbed({
      appId: 'k3',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'off',
    });
    expect(() => chat._setBubbleBadge(5, 2)).not.toThrow();
    expect(bubble().querySelector('[data-cherry-badge]')).toBeNull();
    chat.destroy();
  });
});

// ---------------------------------------------------------------------------
// Lone "@" geometry: an empty number span would still claim the 3px flex gap
// and shove the glyph off-centre, so it must leave layout entirely.
// ---------------------------------------------------------------------------

describe('chatBubble — lone "@" pill is a centred circle', () => {
  /** The number span, which must be out of layout whenever there are no digits. */
  function numSpan(): HTMLElement {
    return badge().querySelector<HTMLElement>('[data-cherry-badge-n]')!;
  }

  it('dot mode + mention: number span hidden, pill square, no padding', async () => {
    const chat = await mountEmbed({ appId: 'l1', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(9, 4));
    expect(badgeText()).toBe('@');
    expect(numSpan().style.display).toBe('none');
    expect(numSpan().textContent).toBe('');
    const { minWidth, height, padding } = badgeSize();
    expect(minWidth).toBe(height); // width equals height -> a circle
    expect(padding).toBe('0px');
    chat.destroy();
  });

  it('count mode with nothing unread: same lone-"@" circle', async () => {
    const chat = await mountEmbed({
      appId: 'l2',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    dispatchEmbedEvent('unreadState', snapshot(0, 6));
    expect(badgeText()).toBe('@');
    expect(numSpan().style.display).toBe('none');
    const { minWidth, height, padding } = badgeSize();
    expect(minWidth).toBe('18px');
    expect(height).toBe('18px');
    expect(padding).toBe('0px'); // the gap+padding meant for digits must not apply
    chat.destroy();
  });

  it('brings the number span back into layout once there are digits', async () => {
    const chat = await mountEmbed({
      appId: 'l3',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    dispatchEmbedEvent('unreadState', snapshot(0, 6));
    expect(numSpan().style.display).toBe('none');

    dispatchEmbedEvent('unreadState', snapshot(4, 6));
    expect(badgeText()).toBe('@4');
    expect(numSpan().style.display).not.toBe('none');
    expect(badgeSize().padding).toBe('0px 5px'); // digits get their breathing room back
    chat.destroy();
  });

  it('keeps the bare dot free of both glyphs', async () => {
    const chat = await mountEmbed({ appId: 'l4', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(5, 0));
    const at = badge().querySelector<HTMLElement>('[data-cherry-badge-at]')!;
    expect(at.style.display).toBe('none');
    expect(numSpan().style.display).toBe('none');
    expect(badgeSize()).toEqual({ minWidth: '12px', height: '12px', padding: '0px' });
    chat.destroy();
  });
});

// ---------------------------------------------------------------------------
// Centre anchoring: states differ in size (12 vs 18), so a fixed corner offset
// would move the badge's centre by 3px as it swaps between them.
// ---------------------------------------------------------------------------

/** Badge centre, in px in from the bubble's top-right corner. */
function badgeCentre(): { fromTop: number; fromRight: number } {
  const el = badge();
  const size = parseFloat(el.style.height);
  return {
    fromTop: parseFloat(el.style.top) + size / 2,
    fromRight: parseFloat(el.style.right) + size / 2,
  };
}

describe('chatBubble — badge is centre-anchored', () => {
  it('keeps one centre across the dot and lone-"@" states', async () => {
    const chat = await mountEmbed({ appId: 'm1', position: 'floating-right', chatBubble: true });

    dispatchEmbedEvent('unreadState', snapshot(5, 0)); // 12px dot
    const dot = badgeCentre();
    expect(badgeSize().minWidth).toBe('12px');

    dispatchEmbedEvent('unreadState', snapshot(5, 2)); // 18px lone-"@" pill
    const at = badgeCentre();
    expect(badgeSize().minWidth).toBe('18px');

    expect(dot).toEqual(at); // no jump between states
    expect(dot).toEqual({ fromTop: 7, fromRight: 7 });
    chat.destroy();
  });

  it('offsets each size off the same 7px anchor', async () => {
    const chat = await mountEmbed({ appId: 'm2', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(5, 0));
    expect(badge().style.top).toBe('1px'); // 7 - 12/2
    expect(badge().style.right).toBe('1px');
    dispatchEmbedEvent('unreadState', snapshot(5, 2));
    expect(badge().style.top).toBe('-2px'); // 7 - 18/2, the original pill offset
    expect(badge().style.right).toBe('-2px');
    chat.destroy();
  });

  it('keeps the numbered pill on the original right edge, growing leftward', async () => {
    const chat = await mountEmbed({
      appId: 'm3',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    dispatchEmbedEvent('unreadState', snapshot(7, 0));
    expect(badge().style.right).toBe('-2px');
    expect(badge().style.top).toBe('-2px');
    dispatchEmbedEvent('unreadState', snapshot(125, 0)); // wider, same right edge
    expect(badge().style.right).toBe('-2px');
    expect(badgeCentre().fromTop).toBe(7);
    chat.destroy();
  });
});

describe('chatBubble — "@" is drawn, not typed', () => {
  function atSlot(): HTMLElement {
    return badge().querySelector<HTMLElement>('[data-cherry-badge-at]')!;
  }

  it('renders an svg glyph rather than the "@" character', async () => {
    const chat = await mountEmbed({ appId: 'n1', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(3, 1));
    const slot = atSlot();
    expect(slot.querySelector('svg')).not.toBeNull();
    expect(slot.textContent).not.toContain('@'); // the literal character is gone
    chat.destroy();
  });

  it('draws the glyph in currentColor on a square box', async () => {
    const chat = await mountEmbed({ appId: 'n2', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(3, 1));
    const svg = atSlot().querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('width')).toBe(svg.getAttribute('height')); // square
    chat.destroy();
  });

  it('keeps an accessible name for the live region', async () => {
    const chat = await mountEmbed({ appId: 'n3', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(3, 1));
    expect(atSlot().querySelector('title')?.textContent).toBe('mention');
    chat.destroy();
  });

  it('shares the same slot with the numbered row', async () => {
    const chat = await mountEmbed({
      appId: 'n4',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    dispatchEmbedEvent('unreadState', snapshot(12, 3));
    expect(badgeText()).toBe('@12');
    expect(atSlot().querySelector('svg')).not.toBeNull();
    expect(atSlot().style.display).not.toBe('none');
    chat.destroy();
  });
});

// ---------------------------------------------------------------------------
// Motion. jsdom runs no animations, so these assert the declarations the
// browser would act on — and that end states are never altered by them.
// ---------------------------------------------------------------------------

/** Installs a matchMedia stub for the reduced-motion query; returns a restore fn. */
function stubReducedMotion(reduce: boolean): () => void {
  const had = 'matchMedia' in window;
  const previous = (window as unknown as { matchMedia?: unknown }).matchMedia;
  (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
  return () => {
    if (had) (window as unknown as { matchMedia: unknown }).matchMedia = previous;
    else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  };
}

describe('chatBubble — badge motion', () => {
  it('transitions geometry, not transform, so the ring keeps its width', async () => {
    const chat = await mountEmbed({ appId: 'p1', position: 'floating-right', chatBubble: true });
    const t = badge().style.transition;
    for (const prop of ['min-width', 'width', 'height', 'top', 'right', 'padding']) {
      expect(t).toContain(`${prop} 180ms cubic-bezier(0.34, 1.56, 0.64, 1)`);
    }
    chat.destroy();
  });

  it('pops the glyph in when it appears on an already-visible badge', async () => {
    const chat = await mountEmbed({ appId: 'p2', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(3, 0)); // badge appears as a dot
    dispatchEmbedEvent('unreadState', snapshot(3, 1)); // glyph lands on it
    const at = badge().querySelector<HTMLElement>('[data-cherry-badge-at]')!;
    expect(at.style.transition).toContain('150ms cubic-bezier(0.34, 1.56, 0.64, 1) 70ms');
    expect(at.style.opacity).toBe('1');
    expect(at.style.transform).toBe('scale(1)');
    chat.destroy();
  });

  it('pops the whole badge in on first appearance', async () => {
    const chat = await mountEmbed({ appId: 'p3', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(2, 0));
    const el = badge();
    expect(el.style.opacity).toBe('1');
    expect(el.style.transform).toBe('scale(1)');
    expect(el.style.transition).toContain('transform 180ms');
    chat.destroy();
  });

  it('drops every transition under prefers-reduced-motion', async () => {
    const restore = stubReducedMotion(true);
    try {
      const chat = await mountEmbed({ appId: 'p4', position: 'floating-right', chatBubble: true });
      expect(badge().style.transition).toBe('');
      dispatchEmbedEvent('unreadState', snapshot(3, 0));
      dispatchEmbedEvent('unreadState', snapshot(3, 1));
      const el = badge();
      expect(el.style.transition).toBe('');
      expect(el.style.transform).toBe('');
      const at = el.querySelector<HTMLElement>('[data-cherry-badge-at]')!;
      expect(at.style.transition).toBe('');
      expect(at.style.opacity).toBe('');
      chat.destroy();
    } finally {
      restore();
    }
  });

  it('keeps transitions when matchMedia reports no preference', async () => {
    const restore = stubReducedMotion(false);
    try {
      const chat = await mountEmbed({ appId: 'p5', position: 'floating-right', chatBubble: true });
      expect(badge().style.transition).toContain('min-width 180ms');
      chat.destroy();
    } finally {
      restore();
    }
  });

  it('leaves final geometry identical with and without motion', async () => {
    const geometry = async (appId: string) => {
      const chat = await mountEmbed({ appId, position: 'floating-right', chatBubble: true });
      dispatchEmbedEvent('unreadState', snapshot(4, 0));
      const dot = { ...badgeSize(), ...badgeCentre() };
      dispatchEmbedEvent('unreadState', snapshot(4, 2));
      const pill = { ...badgeSize(), ...badgeCentre() };
      chat.destroy();
      return { dot, pill };
    };

    const animated = await geometry('p6');
    const restore = stubReducedMotion(true);
    let reduced;
    try {
      reduced = await geometry('p7');
    } finally {
      restore();
    }
    expect(reduced).toEqual(animated); // motion must not move the end state
    expect(animated.dot.minWidth).toBe('12px');
    expect(animated.pill.minWidth).toBe('18px');
  });
});

describe('chatBubble — single digit stays a circle', () => {
  it('pairs an 18px min-width with the docs’ 5px padding', async () => {
    const chat = await mountEmbed({
      appId: 'q1',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    dispatchEmbedEvent('unreadState', snapshot(1, 0));
    // 18px min-width + 2x5px padding leaves one ~7.7px digit inside an exact
    // 18x18 box; 6px padding pushed it to 19.7x18 and read as an egg.
    expect(badgeSize()).toEqual({ minWidth: '18px', height: '18px', padding: '0px 5px' });
    chat.destroy();
  });
});

describe('chatBubble — at-glyph is sized per state', () => {
  function glyph(): SVGElement {
    return badge().querySelector<SVGElement>('[data-cherry-badge-at] svg')!;
  }

  it('fills the lone-"@" pill at 11px', async () => {
    const chat = await mountEmbed({ appId: 'r1', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(5, 2)); // dot mode -> lone "@"
    expect(glyph().getAttribute('width')).toBe('11');
    expect(glyph().getAttribute('height')).toBe('11');
    chat.destroy();
  });

  it('shrinks to 10px beside digits so it does not tower over them', async () => {
    const chat = await mountEmbed({
      appId: 'r2',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    dispatchEmbedEvent('unreadState', snapshot(12, 3)); // "@ 12"
    expect(glyph().getAttribute('width')).toBe('10');
    expect(glyph().getAttribute('height')).toBe('10');
    chat.destroy();
  });

  it('grows back to 11px when the digits go away', async () => {
    const chat = await mountEmbed({
      appId: 'r3',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    dispatchEmbedEvent('unreadState', snapshot(12, 3));
    expect(glyph().getAttribute('width')).toBe('10');
    dispatchEmbedEvent('unreadState', snapshot(0, 3)); // unread cleared -> lone "@"
    expect(glyph().getAttribute('width')).toBe('11');
    chat.destroy();
  });
});

describe('chatBubble — "@ N" row hangs off a shared baseline', () => {
  function row(): HTMLElement {
    return badge().querySelector<HTMLElement>('[data-cherry-badge-row]')!;
  }
  function glyph(): SVGElement {
    return badge().querySelector<SVGElement>('[data-cherry-badge-at] svg')!;
  }

  it('baseline-aligns the pair once digits are present', async () => {
    const chat = await mountEmbed({
      appId: 's1',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    dispatchEmbedEvent('unreadState', snapshot(12, 3));
    // Centring line boxes instead would move the digits' ink by however a
    // given font splits ascent/descent — Segoe UI drifted where DejaVu did not.
    expect(row().style.alignItems).toBe('baseline');
    chat.destroy();
  });

  it('drops the glyph onto the digits’ ink centre', async () => {
    const chat = await mountEmbed({
      appId: 's2',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    dispatchEmbedEvent('unreadState', snapshot(12, 3));
    // 10px glyph: its bottom sits on the baseline, so half its box minus half
    // the digits' ink height puts its centre on theirs.
    expect(glyph().style.transform).toBe('translateY(1.15px)'); // 10/2 - 0.7*11/2
    chat.destroy();
  });

  it('keeps geometric centring, and no shift, without digits', async () => {
    const chat = await mountEmbed({ appId: 's3', position: 'floating-right', chatBubble: true });
    dispatchEmbedEvent('unreadState', snapshot(5, 2)); // dot mode -> lone "@"
    expect(row().style.alignItems).toBe('center');
    expect(glyph().style.transform).toBe('');
    chat.destroy();
  });

  it('reverts to centring when the digits go away', async () => {
    const chat = await mountEmbed({
      appId: 's4',
      position: 'floating-right',
      chatBubble: true,
      chatBubbleBadge: 'count',
    });
    dispatchEmbedEvent('unreadState', snapshot(12, 3));
    expect(row().style.alignItems).toBe('baseline');
    dispatchEmbedEvent('unreadState', snapshot(0, 3));
    expect(row().style.alignItems).toBe('center');
    expect(glyph().style.transform).toBe('');
    chat.destroy();
  });
});

describe('chatBubble — badge never ends a pop invisible', () => {
  it('cancels a stale restore so an interleaved re-pop cannot strand it', async () => {
    vi.useFakeTimers();
    try {
      const chat = await mountEmbed({
        appId: 't1',
        position: 'floating-right',
        chatBubble: true,
        chatBubbleBadge: 'count',
      });
      const el = badge();

      dispatchEmbedEvent('unreadState', snapshot(1, 0)); // first appearance -> pop + restore timer
      await vi.advanceTimersByTimeAsync(50);
      dispatchEmbedEvent('unreadState', snapshot(0, 0)); // hidden mid-pop
      await vi.advanceTimersByTimeAsync(5);
      dispatchEmbedEvent('unreadState', snapshot(1, 0)); // re-pop; first timer must not survive
      await vi.advanceTimersByTimeAsync(400);            // both restore windows elapse

      expect(el.style.opacity).not.toBe('0');
      expect(el.style.transform).toBe('');
      expect(el.style.transition).toContain('min-width');
      expect(badgeVisible()).toBe(true);
      expect(badgeText()).toBe('1');
      chat.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears pop styles when the badge goes empty mid-pop', async () => {
    vi.useFakeTimers();
    try {
      const chat = await mountEmbed({
        appId: 't2',
        position: 'floating-right',
        chatBubble: true,
        chatBubbleBadge: 'count',
      });
      const el = badge();
      dispatchEmbedEvent('unreadState', snapshot(2, 0));
      await vi.advanceTimersByTimeAsync(40);
      dispatchEmbedEvent('unreadState', snapshot(0, 0)); // empty while the pop is in flight
      await vi.advanceTimersByTimeAsync(400);
      expect(el.style.opacity).toBe(''); // never stranded at 0
      expect(el.style.transform).toBe('');
      chat.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives a burst of rapid state changes', async () => {
    vi.useFakeTimers();
    try {
      const chat = await mountEmbed({
        appId: 't3',
        position: 'floating-right',
        chatBubble: true,
        chatBubbleBadge: 'count',
      });
      for (let i = 0; i < 8; i++) {
        dispatchEmbedEvent('unreadState', snapshot(i % 2 ? 0 : i + 1, 0));
        await vi.advanceTimersByTimeAsync(25);
      }
      dispatchEmbedEvent('unreadState', snapshot(9, 0));
      await vi.advanceTimersByTimeAsync(500);
      expect(badgeVisible()).toBe(true);
      expect(badge().style.opacity).not.toBe('0');
      expect(badgeText()).toBe('9');
      chat.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('chatBubble — badge font follows the theme', () => {
  const stack = () => badge().style.fontFamily;
  const ascent = () => badge().getAttribute('data-cherry-badge-ascent');

  it('falls back to the Inter-first stack with no theme font', async () => {
    const chat = await mountEmbed({ appId: 'u1', position: 'floating-right', chatBubble: true });
    expect(stack()).toBe('Inter, system-ui, sans-serif');
    chat.destroy();
  });

  it('puts a themed family first', async () => {
    const chat = await mountEmbed({
      appId: 'u2',
      position: 'floating-right',
      chatBubble: true,
      theme: { fontFamily: 'Poppins' },
    });
    expect(stack()).toBe('Poppins, Inter, system-ui, sans-serif');
    chat.destroy();
  });

  it('quotes a bare multi-word family', async () => {
    const chat = await mountEmbed({
      appId: 'u3',
      position: 'floating-right',
      chatBubble: true,
      theme: { fontFamily: 'Space Grotesk' },
    });
    expect(stack()).toBe('"Space Grotesk", Inter, system-ui, sans-serif');
    chat.destroy();
  });

  it('leaves a ready-made stack alone', async () => {
    const chat = await mountEmbed({
      appId: 'u4',
      position: 'floating-right',
      chatBubble: true,
      theme: { fontFamily: '"FK Grotesk", sans-serif' },
    });
    expect(stack()).toContain('FK Grotesk');
    expect(stack()).toContain('Inter'); // fallbacks still behind it
    chat.destroy();
  });

  it('setTheme swaps the font and re-measures the ascent', async () => {
    const chat = await mountEmbed({ appId: 'u5', position: 'floating-right', chatBubble: true });
    badge().removeAttribute('data-cherry-badge-ascent'); // proves the re-measure ran
    chat.setTheme({ fontFamily: 'Poppins' });
    expect(stack()).toBe('Poppins, Inter, system-ui, sans-serif');
    expect(ascent()).not.toBeNull();
    chat.destroy();
  });

  it('resetTheme returns to the default stack and re-measures', async () => {
    const chat = await mountEmbed({
      appId: 'u6',
      position: 'floating-right',
      chatBubble: true,
      theme: { fontFamily: 'Poppins' },
    });
    expect(stack()).toContain('Poppins');
    badge().removeAttribute('data-cherry-badge-ascent');
    chat.resetTheme();
    expect(stack()).toBe('Inter, system-ui, sans-serif');
    expect(ascent()).not.toBeNull();
    chat.destroy();
  });

  it('keeps weight and size fixed across font changes', async () => {
    const chat = await mountEmbed({
      appId: 'u7',
      position: 'floating-right',
      chatBubble: true,
      theme: { fontFamily: 'Poppins' },
    });
    expect(badge().style.fontWeight).toBe('600');
    expect(badge().style.fontSize).toBe('11px');
    chat.destroy();
  });
});

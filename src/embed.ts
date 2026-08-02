import { EmbedBridge, base64ToBytes, bytesToBase64 } from './bridge';
import { createEmbedIframe, getEmbedOrigin } from './iframe';
import type {
  CherryEmbedConfig,
  EmbedEventMap,
  EmbedLayout,
  EmbedMode,
  EmbedTheme,
  SignChallengeHandler,
  UnreadState,
} from './types';
import { isSignChallengeRequest } from './types';

type EventCallback<K extends keyof EmbedEventMap> = EmbedEventMap[K] extends void
  ? () => void
  : (data: EmbedEventMap[K]) => void;

/**
 * Callback type for `chat.onSignChallenge`.
 *
 * The host provides this function. It receives the raw message bytes to sign
 * (decoded from base64 by the SDK) and must return a Promise that resolves
 * with the signature bytes. The SDK encodes the result back to base64 and
 * sends it to the iframe.
 *
 * Example with Phantom:
 * ```ts
 * chat.onSignChallenge(async (message) => {
 *   const { signature } = await provider.signMessage(message, 'utf8');
 *   return signature;
 * });
 * ```
 */
export class CherryEmbed {
  private readonly config: CherryEmbedConfig;
  private containerEl: HTMLElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private bridge: EmbedBridge | null = null;
  private readonly listeners = new Map<string, Set<Function>>();
  private _isReady = false;
  private _isAuthenticated = false;
  private _isVisible: boolean;
  private readonly _mode: EmbedMode;
  /** Latest `unreadState` payload; `null` until the iframe sends the first one. */
  private _unreadState: UnreadState | null = null;

  /** Current wallet address (may be set before or after mount). */
  private _walletAddress: string | undefined;
  private signChallengeHandler: SignChallengeHandler | undefined;

  constructor(config: CherryEmbedConfig) {
    if (!config.appId) throw new Error('CherryEmbed: appId is required');
    // Floating widgets mount to document.body, so `container` is only
    // required for inline embeds.
    if ((config.position ?? 'inline') === 'inline' && !config.container) {
      throw new Error('CherryEmbed: container is required for inline embeds');
    }
    this.config = config;
    this._mode = config.mode ?? 'single';
    // Visibility is reported to the iframe (it gates auto-mark-read on it), so
    // it must already be correct at the first handshake, before mount() runs.
    this._isVisible = !config.collapsed;
    this._walletAddress = config.walletAddress;
    this.signChallengeHandler = config.signChallengeHandler;
  }

  async mount(): Promise<void> {
    // 0. A stacked mount is not just cosmetic: the orphaned bridge keeps its
    //    listener and re-runs the handshake on every later `ready`.
    this.teardownInstance();

    // 1. Resolve container. Floating widgets may omit it and mount to body.
    if (this.config.container) {
      this.containerEl =
        typeof this.config.container === 'string'
          ? document.querySelector<HTMLElement>(this.config.container)
          : this.config.container;
      if (!this.containerEl) throw new Error('CherryEmbed: container not found');
    } else {
      if (!document.body) {
        throw new Error('CherryEmbed: document.body is not available — call mount() after DOMContentLoaded');
      }
      this.containerEl = document.body;
    }

    // 2. Create iframe
    this.iframe = createEmbedIframe({
      appId: this.config.appId,
      roomId: this.config.roomId,
      mode: this._mode,
      embedUrl: this.config.embedUrl,
      container: this.containerEl,
      position: this.config.position ?? 'inline',
    });

    // 2a. Hide before awaiting `ready` below: otherwise a widget that must start
    //     hidden stays on screen for up to 30s while reporting visible:false.
    if (!this._isVisible) {
      this.iframe.style.opacity = '0';
      this.iframe.style.display = 'none';
    }

    // 3. Create bridge
    const origin = getEmbedOrigin(this.config.embedUrl);
    this.bridge = new EmbedBridge(this.iframe, origin);
    if (this.signChallengeHandler) {
      this.registerSignChallengeHandler(this.bridge, this.signChallengeHandler);
    }

    // 4. Setup event forwarding before waiting for ready
    this.setupEventForwarding();

    // 5. Re-apply config on EVERY `ready` event, not just the first one.
    //    The iframe may reload itself in fallback paths (missing client
    //    during boot, wallet switch, or a failed client.initialize()),
    //    which wipes theme/layout state inside the iframe. Without this,
    //    only server-side defaults would survive the reload. `auth.token`
    //    is idempotent on the iframe side (it no-ops if a valid JWT is
    //    already stored), unless `force: true` is passed — see `setToken()`.
    this.bridge.onEvent('ready', () => this.sendInitConfigs());

    // 6. Wait for ready event with timeout. `sendInitConfigs()` will already
    //    have fired via the handler above by the time this resolves.
    //    (Step 2a above already hid the iframe if it starts hidden, so
    //    no re-hide is needed here.)
    await this.waitForReady(30_000);
  }

  private sendInitConfigs(): void {
    if (!this.bridge) return;
    // Unconditional handshake: the iframe bridge captures `parentOrigin`
    // from the first validated command. In minimal integrations (e.g.
    // wallet-only with no host wallet, no theme overrides) the host would
    // otherwise never send anything and the iframe could not call
    // bridge.signChallenge / bridge.sendRequest. setTheme({}) is a no-op
    // on the iframe side (sanitiseThemeParams returns an empty merge).
    this.bridge.sendCommand('setTheme', {});
    if (this.config.token) {
      this.bridge.sendCommand('auth.token', { token: this.config.token });
    }
    if (this._walletAddress) {
      this.bridge.sendCommand('setWalletAddress', { walletAddress: this._walletAddress });
    }
    if (this.config.theme) {
      this.bridge.sendCommand('setTheme', this.config.theme as Record<string, unknown>);
    }
    if (this.config.layout) {
      this.bridge.sendCommand('setLayout', this.config.layout as Record<string, unknown>);
    }
    // The iframe defaults to visible; a widget mounted collapsed (or hidden
    // before a reload) must say so or it keeps auto-marking messages read.
    this.bridge.sendCommand('setVisibility', { visible: this._isVisible });
  }

  destroy(): void {
    this.teardownInstance();
    this.containerEl = null;
    this.listeners.clear();
    this._isReady = false;
    this._isAuthenticated = false;
    this._unreadState = null;
  }

  setRoom(roomId: string): void {
    this.bridge?.sendCommand('setRoom', { roomId });
  }

  setTheme(theme: Partial<EmbedTheme>): void {
    // Keep config.theme in sync with what the iframe currently has so
    // that — after the iframe reloads (e.g. when the user signs in and
    // EmbedShell calls `window.location.reload()`) — the SDK can replay
    // the latest palette via the `ready` re-init, not the stale theme
    // captured at construction time.
    const merged: EmbedTheme = { ...(this.config.theme ?? {}), ...theme };
    (this.config as { theme?: EmbedTheme }).theme = merged;
    this.bridge?.sendCommand('setTheme', theme as Record<string, unknown>);
  }

  /**
   * Reset every theme field back to the iframe's built-in defaults.
   * `setTheme(...)` merges into existing state on the iframe side, so
   * hosts that switch between completely different palettes should call
   * `resetTheme()` first and then `setTheme(newPalette)` — otherwise
   * fields not present in the new palette will leak through from the
   * previous one.
   */
  resetTheme(): void {
    // Mirror the reset on the host-side cache so a subsequent iframe
    // reload doesn't re-apply a theme the user already cleared.
    (this.config as { theme?: EmbedTheme }).theme = undefined;
    this.bridge?.sendCommand('resetTheme', {});
  }

  setLayout(layout: Partial<EmbedLayout>): void {
    // Same reason as setTheme: an iframe reload wipes layout state, and the
    // `ready` re-init replays `config.layout`, not what the host set last.
    const merged: EmbedLayout = { ...(this.config.layout ?? {}), ...layout };
    (this.config as { layout?: EmbedLayout }).layout = merged;
    this.bridge?.sendCommand('setLayout', layout as Record<string, unknown>);
  }

  setToken(token: string): void {
    // Keep config in sync so future `ready` events (after iframe reload) re-send
    // the latest token, not the stale one from construction time.
    (this.config as { token?: string }).token = token;
    // A forced re-exchange can land on a different account, so the cached
    // counts belong to the previous viewer until the iframe re-emits.
    this.clearUnreadCache();
    // `force: true` tells the iframe to discard any existing JWT and exchange
    // this embed token again. Without it, the iframe would skip re-exchange
    // because a JWT is already in its sessionStorage — which is exactly the
    // behavior we want for the regular `ready` re-send path, but NOT for an
    // explicit refresh via setToken.
    this.bridge?.sendCommand('auth.token', { token, force: true });
  }

  /**
   * Sign the iframe out — clears its sessionStorage JWT and reloads the
   * iframe. After reload it boots in preview mode (or shows the wallet CTA
   * for wallet-only / app-trusted+wallet apps).
   *
   * Use this for testing the preview→auth flow without closing the tab, or
   * for explicit "Sign out" UI in the host.
   */
  signOut(): void {
    // Drop cached token from in-memory config so a future re-mount doesn't
    // automatically re-authenticate from the stale value.
    (this.config as { token?: string }).token = undefined;
    // The runtime emits nothing for a signed-out viewer, so the cache would
    // keep serving pre-logout counts forever — refreshUnreadState() included.
    this.clearUnreadCache();
    this.bridge?.sendCommand('auth.logout', {});
  }

  /**
   * Inform the iframe of the currently connected wallet address.
   *
   * This is useful when the host knows the wallet address before the iframe
   * needs to start a `signChallenge` flow, so the iframe can display the
   * address early.
   *
   * Call this after `mount()` or pass `walletAddress` in the constructor
   * config to have it sent automatically when the iframe is ready.
   */
  setWalletAddress(address: string): void {
    // A wallet switch is a viewer switch; the first address of a session is not
    // (nothing cached yet to drop).
    if (this._walletAddress !== undefined && this._walletAddress !== address) {
      this.clearUnreadCache();
    }
    this._walletAddress = address;
    // Sync config so sendInitConfigs() re-sends on iframe reload
    (this.config as { walletAddress?: string }).walletAddress = address;
    this.bridge?.sendCommand('setWalletAddress', { walletAddress: address });
  }

  /**
   * Register a callback that the SDK calls when the embedded iframe requests
   * a wallet signature (the `signChallenge` bridge request).
   *
   * The handler receives raw message bytes (decoded from base64) and must
   * return a Promise resolving to the signature bytes. The SDK handles
   * base64 encode/decode on both sides — the handler only deals with
   * `Uint8Array`.
   *
   * If no handler is registered when the iframe sends a `signChallenge`
   * request, the bridge responds with a `METHOD_NOT_FOUND` error.
   *
   * Example — Phantom wallet:
   * ```ts
   * chat.onSignChallenge(async (message) => {
   *   const result = await window.phantom.solana.signMessage(message, 'utf8');
   *   return result.signature;
   * });
   * ```
   *
   * Example — test stub (TweetNaCl):
   * ```ts
   * import nacl from 'tweetnacl';
   * const keypair = nacl.sign.keyPair();
   * chat.onSignChallenge(async (message) => {
   *   return nacl.sign.detached(message, keypair.secretKey);
   * });
   * ```
   */
  onSignChallenge(handler: SignChallengeHandler): void {
    this.signChallengeHandler = handler;
    (this.config as { signChallengeHandler?: SignChallengeHandler }).signChallengeHandler = handler;
    if (!this.bridge) {
      throw new Error(
        'CherryEmbed: call onSignChallenge() after mount() or pass signChallengeHandler in the constructor — ' +
        'the bridge is not yet initialised.',
      );
    }
    this.registerSignChallengeHandler(this.bridge, handler);
  }

  /**
   * Remove a previously registered signChallenge handler.
   * After this call the bridge responds with METHOD_NOT_FOUND for new requests.
   */
  offSignChallenge(): void {
    this.bridge?.offIncomingRequest('signChallenge');
  }

  show(): void {
    if (this.iframe) {
      this.iframe.style.display = 'block';
      this.iframe.style.opacity = '1';
      this.iframe.style.transform = 'translateY(0)';
    }
    this._isVisible = true;
    // Hiding is CSS-only, so the iframe cannot observe it — report it, or the
    // chat keeps marking incoming messages read behind a closed widget.
    this.bridge?.sendCommand('setVisibility', { visible: true });
  }

  hide(): void {
    if (this.iframe) {
      this.iframe.style.opacity = '0';
      this.iframe.style.transform = 'translateY(10px)';
      // Delay display:none until after the CSS transition completes
      setTimeout(() => {
        if (this.iframe && !this._isVisible) {
          this.iframe.style.display = 'none';
        }
      }, 200);
    }
    this._isVisible = false;
    this.bridge?.sendCommand('setVisibility', { visible: false });
  }

  toggle(): void {
    this._isVisible ? this.hide() : this.show();
  }

  /**
   * Latest unread snapshot pushed by the iframe, or `null` when there is none
   * to show: before the first `unreadState` event (session still loading, or
   * not signed in) and after `signOut()`.
   *
   * Synchronous read of a cache — subscribe to `unreadState` if you want to
   * react to changes.
   */
  getUnreadState(): UnreadState | null {
    return this._unreadState;
  }

  /**
   * Unread message count from the same cache: across every tracked room, or
   * for one room when `roomId` is given. Returns `0` when nothing is cached
   * yet or the room is unknown.
   */
  getUnreadCount(roomId?: string): number {
    const state = this._unreadState;
    if (!state) return 0;
    if (roomId === undefined) return state.total.unread;
    return state.rooms.find((room) => room.roomId === roomId)?.unread ?? 0;
  }

  /**
   * Ask the iframe for a fresh `unreadState` event. Fire-and-forget: the
   * answer arrives through the event stream and updates the cache. Only
   * needed if you poll instead of subscribing — the iframe already pushes on
   * every change.
   */
  refreshUnreadState(): void {
    this.bridge?.sendCommand('requestUnreadState', {});
  }

  on<K extends keyof EmbedEventMap>(event: K, cb: EventCallback<K>): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb as Function);
  }

  off<K extends keyof EmbedEventMap>(event: K, cb: EventCallback<K>): void {
    this.listeners.get(event)?.delete(cb as Function);
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get walletAddress(): string | undefined {
    return this._walletAddress;
  }

  /** The embed mode resolved at construction time (defaults to `'single'`). */
  get currentMode(): EmbedMode {
    return this._mode;
  }

  // ---- Private ----

  /** Drops the DOM + bridge of one mount; shared by destroy() and re-mount. */
  private teardownInstance(): void {
    this.bridge?.destroy();
    this.iframe?.remove();
    this.bridge = null;
    this.iframe = null;
  }

  /** Counters belong to a viewer — a new one starts from a blank cache. */
  private clearUnreadCache(): void {
    this._unreadState = null;
  }

  private emit(event: string, data?: unknown): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        (cb as (data: unknown) => void)(data);
      } catch (e) {
        console.error('CherryEmbed event handler error:', e);
      }
    });
  }

  private setupEventForwarding(): void {
    if (!this.bridge) return;

    const events: (keyof EmbedEventMap)[] = [
      'ready',
      'unreadCount',
      'unreadState',
      'message',
      'authStateChange',
      'tokenExpired',
      'error',
      'walletConnectRequested',
      'preview',
      'roomChanged',
    ];

    for (const event of events) {
      this.bridge.onEvent(event, (data: unknown) => {
        if (event === 'authStateChange') {
          this._isAuthenticated = data as boolean;
        }
        // Shape-check before caching AND before emitting: listeners are typed
        // `UnreadState`, so junk from another runtime would throw in host code.
        if (event === 'unreadState') {
          if (!isUnreadState(data)) {
            debugWarn('dropped malformed unreadState payload:', data);
            return;
          }
          this._unreadState = data;
        }
        this.emit(event, data);
      });
    }
  }

  /**
   * Wire the signChallenge incoming-request handler on the bridge.
   * Separated so it can be called from `onSignChallenge` (post-mount) and
   * potentially from `mount()` if a handler was already registered via config.
   */
  private registerSignChallengeHandler(bridge: EmbedBridge, handler: SignChallengeHandler): void {
    bridge.onIncomingRequest<Record<string, unknown>, { signature: string }>(
      'signChallenge',
      async (params) => {
        // Validate the request shape before dispatching
        const fakeReq = { type: 'cherry:request' as const, id: '', method: 'signChallenge' as const, params };
        if (!isSignChallengeRequest(fakeReq)) {
          throw new Error('Invalid signChallenge params: missing base64 "message" field');
        }
        const messageBytes = base64ToBytes(fakeReq.params.message);
        const signatureBytes = await handler(messageBytes);
        return { signature: bytesToBase64(signatureBytes) };
      },
    );
  }

  private waitForReady(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('CherryEmbed: iframe ready timeout'));
      }, timeoutMs);

      this.bridge!.onEvent('ready', () => {
        clearTimeout(timer);
        this._isReady = true;
        resolve();
      });
    });
  }
}

/** Non-fatal protocol complaint — never throws into host code. */
function debugWarn(...args: unknown[]): void {
  console.warn('[CherryEmbed]', ...args);
}

/** Structural check for `unreadState` payloads arriving over the bridge. */
function isUnreadState(data: unknown): data is UnreadState {
  if (typeof data !== 'object' || data === null) return false;
  const { rooms, total } = data as { rooms?: unknown; total?: unknown };
  if (!Array.isArray(rooms) || typeof total !== 'object' || total === null) return false;
  const { unread, mentions } = total as { unread?: unknown; mentions?: unknown };
  if (typeof unread !== 'number' || typeof mentions !== 'number') return false;
  return rooms.every((room: unknown) => {
    if (typeof room !== 'object' || room === null) return false;
    const r = room as { roomId?: unknown; unread?: unknown; mentions?: unknown };
    return typeof r.roomId === 'string' && typeof r.unread === 'number' && typeof r.mentions === 'number';
  });
}

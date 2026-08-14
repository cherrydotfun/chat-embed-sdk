import { EmbedBridge, base64ToBytes, bytesToBase64 } from './bridge';
import { createEmbedIframe, getEmbedOrigin } from './iframe';
import type {
  CherryEmbedConfig,
  EmbedEventMap,
  EmbedLayout,
  EmbedMode,
  EmbedTheme,
  EmbedUserProfile,
  EmbedUserSearchResult,
  GetUserHandler,
  ResolveUsersHandler,
  SearchUsersHandler,
  SignChallengeHandler,
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
  private _isVisible = true;
  private readonly _mode: EmbedMode;

  /** Current wallet address (may be set before or after mount). */
  private _walletAddress: string | undefined;
  private signChallengeHandler: SignChallengeHandler | undefined;

  // Host-provided identity. Handlers are answered on demand; the token is kept
  // here (never persisted) so it survives an iframe reload.
  private resolveUsersHandler: ResolveUsersHandler | undefined;
  private searchUsersHandler: SearchUsersHandler | undefined;
  private getUserHandler: GetUserHandler | undefined;
  private _identityToken: string | undefined;

  constructor(config: CherryEmbedConfig) {
    if (!config.appId) throw new Error('CherryEmbed: appId is required');
    // Floating widgets mount to document.body, so `container` is only
    // required for inline embeds.
    if ((config.position ?? 'inline') === 'inline' && !config.container) {
      throw new Error('CherryEmbed: container is required for inline embeds');
    }
    this.config = config;
    this._mode = config.mode ?? 'single';
    this._walletAddress = config.walletAddress;
    this.signChallengeHandler = config.signChallengeHandler;
    this.resolveUsersHandler = config.resolveUsers;
    this.searchUsersHandler = config.searchUsers;
    this.getUserHandler = config.getUser;
    this._identityToken = config.identityToken;
  }

  async mount(): Promise<void> {
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

    // 2a. If mounted collapsed, hide IMMEDIATELY — before awaiting the
    //     iframe's `ready` event below. Otherwise the iframe stays fully
    //     visible for up to 30s while the room loads, which on a floating
    //     mount looks like a giant chat panel that refuses to close.
    if (this.config.collapsed) {
      this.iframe.style.opacity = '0';
      this.iframe.style.display = 'none';
      this._isVisible = false;
    }

    // 3. Create bridge
    const origin = getEmbedOrigin(this.config.embedUrl);
    this.bridge = new EmbedBridge(this.iframe, origin);
    if (this.signChallengeHandler) {
      this.registerSignChallengeHandler(this.bridge, this.signChallengeHandler);
    }
    this.registerUserIdentityHandlers(this.bridge);

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
    //    (Step 2a above already hid the iframe if `collapsed: true`, so
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
    // Host-provided identity: token first, then the profiles the host already
    // has, so the first paint can show them without a round-trip. Re-sent after
    // an iframe reload for the same reason the token above is.
    if (this._identityToken) {
      this.bridge.sendCommand('users.auth', { token: this._identityToken });
    }
    if (this.config.userProfiles && Object.keys(this.config.userProfiles).length > 0) {
      this.bridge.sendCommand('users.update', { users: this.config.userProfiles });
    }
  }

  destroy(): void {
    this.bridge?.destroy();
    this.iframe?.remove();
    this.bridge = null;
    this.iframe = null;
    this.containerEl = null;
    this.listeners.clear();
    this._isReady = false;
    this._isAuthenticated = false;
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
    this.bridge?.sendCommand('setLayout', layout as Record<string, unknown>);
  }

  setToken(token: string): void {
    // Keep config in sync so future `ready` events (after iframe reload) re-send
    // the latest token, not the stale one from construction time.
    (this.config as { token?: string }).token = token;
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
    this._walletAddress = address;
    // Sync config so sendInitConfigs() re-sends on iframe reload
    (this.config as { walletAddress?: string }).walletAddress = address;
    this.bridge?.sendCommand('setWalletAddress', { walletAddress: address });
  }

  /**
   * Push display names / avatars for wallets into the running chat.
   *
   * Use this when you already know who someone is (so the first render shows
   * your name with no round-trip) and, more importantly, when something
   * CHANGES: a user renaming themselves in your app is invisible to an open
   * chat otherwise, because the iframe only asks about wallets it hasn't
   * resolved yet.
   *
   * A pushed profile outranks anything resolved through `resolveUsers` and
   * never expires. Pass `null` for a wallet to say "I don't know this one" —
   * the chat falls back to its Cherry identity.
   *
   * Requires "Who your users appear as" to be enabled for this embed in the
   * portal; otherwise the iframe ignores it.
   */
  setUserProfiles(users: Record<string, EmbedUserProfile | null>): void {
    if (!users || Object.keys(users).length === 0) return;
    // Merge into the mount-time map so a re-mount / iframe reload replays the
    // current picture rather than the one the page started with.
    const merged = { ...(this.config.userProfiles ?? {}) };
    for (const [id, profile] of Object.entries(users)) {
      if (profile) merged[id] = profile;
      else delete merged[id];
    }
    (this.config as { userProfiles?: Record<string, EmbedUserProfile> }).userProfiles = merged;
    this.bridge?.sendCommand('users.update', { users });
  }

  /**
   * Forget cached profiles so the chat asks `resolveUsers` for them again.
   * Omit `ids` to drop everything (e.g. the visitor signed into a different
   * account in your app).
   */
  invalidateUserProfiles(ids?: string[]): void {
    if (ids && ids.length > 0) {
      const remaining = { ...(this.config.userProfiles ?? {}) };
      for (const id of ids) delete remaining[id];
      (this.config as { userProfiles?: Record<string, EmbedUserProfile> }).userProfiles = remaining;
    } else {
      (this.config as { userProfiles?: Record<string, EmbedUserProfile> }).userProfiles = undefined;
    }
    this.bridge?.sendCommand('users.invalidate', ids && ids.length > 0 ? { ids } : {});
  }

  /**
   * Set (or refresh) the bearer token the chat sends to the profile endpoint
   * configured in the portal. Held in memory only — never written to storage,
   * and never sent anywhere except that endpoint.
   *
   * Pass `undefined` to stop sending an Authorization header.
   */
  setIdentityToken(token: string | undefined): void {
    this._identityToken = token;
    (this.config as { identityToken?: string }).identityToken = token;
    this.bridge?.sendCommand('users.auth', { token: token ?? '' });
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
  }

  toggle(): void {
    this._isVisible ? this.hide() : this.show();
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

  /**
   * Wire the host-provided identity requests (`users.resolve` / `users.search`
   * / `users.get`) onto the bridge.
   *
   * Registered only for the handlers the host actually supplied: an
   * unregistered method gets an immediate `METHOD_NOT_FOUND` reply, which the
   * iframe reads as "this transport can't answer" and stops asking — far better
   * than a handler that resolves empty, which would look like "nobody is
   * known" and cache negatives for every wallet in the room.
   */
  private registerUserIdentityHandlers(bridge: EmbedBridge): void {
    if (this.resolveUsersHandler) {
      bridge.onIncomingRequest<{ ids?: unknown }, { users: Record<string, EmbedUserProfile | null> }>(
        'users.resolve',
        async (params) => {
          const ids = Array.isArray(params?.ids)
            ? params.ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
            : [];
          if (ids.length === 0) return { users: {} };
          const users = await this.resolveUsersHandler!(ids);
          return { users: users ?? {} };
        },
      );
    }

    if (this.searchUsersHandler) {
      bridge.onIncomingRequest<
        { query?: unknown; cursor?: unknown; limit?: unknown },
        EmbedUserSearchResult
      >('users.search', async (params) => {
        const result = await this.searchUsersHandler!({
          query: typeof params?.query === 'string' ? params.query : undefined,
          cursor: typeof params?.cursor === 'string' ? params.cursor : undefined,
          limit: typeof params?.limit === 'number' ? params.limit : 10,
        });
        return { users: result?.users ?? [], nextCursor: result?.nextCursor };
      });
    }

    if (this.getUserHandler) {
      bridge.onIncomingRequest<{ id?: unknown }, EmbedUserProfile | null>(
        'users.get',
        async (params) => {
          if (typeof params?.id !== 'string' || !params.id) {
            throw new Error('users.get: "id" must be a wallet address');
          }
          return (await this.getUserHandler!(params.id)) ?? null;
        },
      );
    }
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

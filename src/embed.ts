import { EmbedBridge } from './bridge';
import { createEmbedIframe, getEmbedOrigin } from './iframe';
import type { CherryEmbedConfig, EmbedEventMap, EmbedLayout, EmbedTheme } from './types';

type EventCallback<K extends keyof EmbedEventMap> = EmbedEventMap[K] extends void
  ? () => void
  : (data: EmbedEventMap[K]) => void;

export class CherryEmbed {
  private readonly config: CherryEmbedConfig;
  private containerEl: HTMLElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private bridge: EmbedBridge | null = null;
  private readonly listeners = new Map<string, Set<Function>>();
  private _isReady = false;
  private _isAuthenticated = false;
  private _isVisible = true;

  constructor(config: CherryEmbedConfig) {
    if (!config.appId) throw new Error('CherryEmbed: appId is required');
    if (!config.container) throw new Error('CherryEmbed: container is required');
    this.config = config;
  }

  async mount(): Promise<void> {
    // 1. Resolve container
    this.containerEl =
      typeof this.config.container === 'string'
        ? document.querySelector<HTMLElement>(this.config.container)
        : this.config.container;
    if (!this.containerEl) throw new Error('CherryEmbed: container not found');

    // 2. Create iframe
    this.iframe = createEmbedIframe({
      appId: this.config.appId,
      roomId: this.config.roomId,
      embedUrl: this.config.embedUrl,
      container: this.containerEl,
      position: this.config.position ?? 'inline',
    });

    // 3. Create bridge
    const origin = getEmbedOrigin(this.config.embedUrl);
    this.bridge = new EmbedBridge(this.iframe, origin);

    // 4. Setup event forwarding before waiting for ready
    this.setupEventForwarding();

    // 5. Re-apply config on EVERY `ready` event, not just the first one.
    //    The iframe may reload itself (e.g. after the initial embed-token →
    //    Cherry JWT exchange calls `window.location.reload()`), which wipes
    //    theme/layout state inside the iframe. Without this, only server-side
    //    defaults would survive the reload. `auth.token` is idempotent on the
    //    iframe side (it no-ops if a valid JWT is already stored), unless
    //    `force: true` is passed — see `setToken()`.
    this.bridge.onEvent('ready', () => this.sendInitConfigs());

    // 6. Wait for ready event with timeout. `sendInitConfigs()` will already
    //    have fired via the handler above by the time this resolves.
    await this.waitForReady(30_000);

    // 7. Handle collapsed state
    if (this.config.collapsed) {
      this.hide();
    }
  }

  private sendInitConfigs(): void {
    if (!this.bridge) return;
    if (this.config.token) {
      this.bridge.sendCommand('auth.token', { token: this.config.token });
    }
    if (this.config.theme) {
      this.bridge.sendCommand('setTheme', this.config.theme as Record<string, unknown>);
    }
    if (this.config.layout) {
      this.bridge.sendCommand('setLayout', this.config.layout as Record<string, unknown>);
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
    this.bridge?.sendCommand('setTheme', theme as Record<string, unknown>);
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
    // because a JWT is already in localStorage — which is exactly the behavior
    // we want for the regular `ready` re-send path, but NOT for explicit
    // refresh via setToken (which is called in response to `tokenExpired`).
    this.bridge?.sendCommand('auth.token', { token, force: true });
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

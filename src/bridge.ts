import type { BridgeCommand, BridgeEvent, BridgeRequest, BridgeResponse } from './types';

const REQUEST_TIMEOUT_MS = 30_000;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class EmbedBridge {
  private readonly iframe: HTMLIFrameElement;
  private readonly embedOrigin: string;
  private readonly eventHandlers = new Map<string, Set<(data: unknown) => void>>();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private messageListener: ((event: MessageEvent) => void) | null;

  constructor(iframe: HTMLIFrameElement, embedOrigin: string) {
    this.iframe = iframe;
    this.embedOrigin = embedOrigin;

    this.messageListener = (event: MessageEvent) => this.handleMessage(event);
    window.addEventListener('message', this.messageListener);
  }

  sendCommand(method: string, params?: Record<string, unknown>): void {
    const msg: BridgeCommand = {
      type: 'cherry:cmd',
      method,
      ...(params !== undefined ? { params } : {}),
    };
    this.postToIframe(msg);
  }

  onEvent(event: string, handler: (data: unknown) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  offEvent(event: string, handler: (data: unknown) => void): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const id = generateId();

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new EmbedBridgeError(`Request timed out: ${method}`, 'TIMEOUT'));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const msg: BridgeRequest = {
        type: 'cherry:request',
        id,
        method,
        ...(params !== undefined ? { params } : {}),
      };
      this.postToIframe(msg);
    });
  }

  destroy(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }

    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new EmbedBridgeError('Bridge destroyed', 'DESTROYED'));
      this.pendingRequests.delete(id);
    }

    this.eventHandlers.clear();
  }

  private postToIframe(message: BridgeCommand | BridgeRequest): void {
    this.iframe.contentWindow?.postMessage(message, this.embedOrigin);
  }

  private handleMessage(event: MessageEvent): void {
    // CRITICAL: validate origin before processing any message
    if (event.origin !== this.embedOrigin) {
      // Debug: log rejected origins for cherry messages
      if (typeof event.data === 'object' && event.data?.type?.startsWith?.('cherry:')) {
        console.debug('[EmbedBridge] Rejected origin:', event.origin, 'expected:', this.embedOrigin, 'msg:', event.data?.type);
      }
      return;
    }

    let data: unknown = event.data;

    // Some environments serialize messages as strings
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data) as unknown;
      } catch {
        return;
      }
    }

    if (!isObject(data) || typeof data['type'] !== 'string') return;

    const type = data['type'] as string;

    if (type === 'cherry:event') {
      const msg = data as unknown as BridgeEvent;
      if (typeof msg.event !== 'string') return;
      const handlers = this.eventHandlers.get(msg.event);
      if (handlers) {
        for (const handler of handlers) {
          handler(msg.data);
        }
      }
      return;
    }

    if (type === 'cherry:response') {
      const msg = data as unknown as BridgeResponse;
      const pending = this.pendingRequests.get(msg.id);
      if (!pending) return;

      this.pendingRequests.delete(msg.id);
      clearTimeout(pending.timer);

      if (msg.error) {
        const err = msg.error;
        pending.reject(new EmbedBridgeError(err.message ?? 'Unknown error', err.code ?? 'UNKNOWN'));
      } else {
        pending.resolve(msg.result);
      }
    }
  }

}

export class EmbedBridgeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'EmbedBridgeError';
  }
}

// ---- helpers ----

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

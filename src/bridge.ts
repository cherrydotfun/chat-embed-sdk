import type {
  BridgeCommand,
  BridgeEvent,
  BridgeRequest,
  BridgeResponse,
  SignChallengeRequest,
} from './types';
import { isSignChallengeRequest } from './types';

/**
 * How long (ms) the host has to respond to an incoming request before the
 * bridge automatically sends an error response back to the iframe.
 */
const INCOMING_REQUEST_TIMEOUT_MS = 60_000;

/**
 * How long (ms) to wait for a response to an outbound request sent by the
 * host (kept for symmetry / future host-initiated requests).
 */
const REQUEST_TIMEOUT_MS = 30_000;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Handler registered by the host for an incoming bridge request method.
 * Receives decoded params and must return a result (or throw / reject).
 */
type IncomingRequestHandler<TParams = unknown, TResult = unknown> = (
  params: TParams,
) => Promise<TResult>;

export class EmbedBridge {
  private readonly iframe: HTMLIFrameElement;
  private readonly embedOrigin: string;
  private readonly eventHandlers = new Map<string, Set<(data: unknown) => void>>();
  private readonly pendingRequests = new Map<string, PendingRequest>();

  /**
   * Handlers for incoming `cherry:request` messages from the iframe.
   * Key is the `method` field.
   */
  private readonly incomingHandlers = new Map<string, IncomingRequestHandler>();

  private messageListener: ((event: MessageEvent) => void) | null;

  constructor(iframe: HTMLIFrameElement, embedOrigin: string) {
    this.iframe = iframe;
    this.embedOrigin = embedOrigin;

    this.messageListener = (event: MessageEvent) => this.handleMessage(event);
    window.addEventListener('message', this.messageListener);
  }

  // ---- Outbound: host → iframe ----

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
        method: method as BridgeRequest['method'],
        ...(params !== undefined ? { params } : {}),
      };
      this.postToIframe(msg);
    });
  }

  // ---- Inbound: iframe → host (request/response) ----

  /**
   * Register a handler for incoming `cherry:request` messages from the iframe.
   * When the iframe sends a request with the given `method`, the handler is
   * invoked. Its return value (or rejection) is forwarded back as a
   * `cherry:response` to the iframe with the same `id`.
   *
   * A timeout of `INCOMING_REQUEST_TIMEOUT_MS` (60 s) applies: if the handler
   * does not resolve/reject in time, an error response is sent automatically.
   */
  onIncomingRequest<TParams = unknown, TResult = unknown>(
    method: string,
    handler: IncomingRequestHandler<TParams, TResult>,
  ): void {
    this.incomingHandlers.set(method, handler as IncomingRequestHandler);
  }

  offIncomingRequest(method: string): void {
    this.incomingHandlers.delete(method);
  }

  // ---- Lifecycle ----

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
    this.incomingHandlers.clear();
  }

  // ---- Private helpers ----

  private postToIframe(message: BridgeCommand | BridgeRequest | BridgeResponse): void {
    this.iframe.contentWindow?.postMessage(message, this.embedOrigin);
  }

  private sendResponseToIframe(id: string, result: unknown): void {
    const msg: BridgeResponse = { type: 'cherry:response', id, result };
    this.postToIframe(msg);
  }

  private sendErrorResponseToIframe(id: string, code: string, message: string): void {
    const msg: BridgeResponse = { type: 'cherry:response', id, error: { code, message } };
    this.postToIframe(msg);
  }

  /**
   * Dispatch an incoming `cherry:request` to the registered handler.
   * Enforces a per-request timeout and always sends exactly one response.
   */
  private async dispatchIncomingRequest(req: BridgeRequest): Promise<void> {
    const { id, method, params } = req;
    const handler = this.incomingHandlers.get(method);

    if (!handler) {
      this.sendErrorResponseToIframe(id, 'METHOD_NOT_FOUND', `No handler registered for method: ${method}`);
      return;
    }

    let settled = false;

    const timeoutHandle = setTimeout(() => {
      if (!settled) {
        settled = true;
        this.sendErrorResponseToIframe(id, 'HANDLER_TIMEOUT', `Handler for "${method}" did not respond within ${INCOMING_REQUEST_TIMEOUT_MS}ms`);
      }
    }, INCOMING_REQUEST_TIMEOUT_MS);

    try {
      const result = await handler(params ?? {});
      if (!settled) {
        settled = true;
        clearTimeout(timeoutHandle);
        this.sendResponseToIframe(id, result);
      }
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutHandle);
        const message = err instanceof Error ? err.message : String(err);
        this.sendErrorResponseToIframe(id, 'HANDLER_ERROR', message);
      }
    }
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
      // Response to a host-initiated outbound request
      const msg = data as unknown as BridgeResponse;
      if (typeof msg.id !== 'string') return;
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
      return;
    }

    if (type === 'cherry:request') {
      // Incoming request from the iframe — dispatch to registered handler
      const msg = data as unknown as BridgeRequest;
      if (typeof msg.id !== 'string' || typeof msg.method !== 'string') return;
      void this.dispatchIncomingRequest(msg);
      return;
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

// ---- Base64 helpers (pure, browser & Node compatible) ----

/**
 * Decode a base64 string to a Uint8Array.
 *
 * Uses `atob` when available (browser + jsdom + modern Node via global).
 * Falls back to a pure lookup-table implementation so no Node.js `Buffer`
 * dependency is required in the lib (avoids `@types/node` in tsconfig lib).
 */
export function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  // Pure fallback (should not be reached in supported environments)
  return _base64ToBytesPolyfill(b64);
}

/**
 * Encode a Uint8Array to a base64 string.
 *
 * Uses `btoa` when available; falls back to pure implementation.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }
  return _bytesToBase64Polyfill(bytes);
}

// Pure base64 polyfills (no external dependencies, no Buffer)
const _B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function _bytesToBase64Polyfill(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < len ? bytes[i + 1]! : 0;
    const b2 = i + 2 < len ? bytes[i + 2]! : 0;
    result += _B64_CHARS[b0 >> 2];
    result += _B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? _B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? _B64_CHARS[b2 & 63] : '=';
  }
  return result;
}

function _base64ToBytesPolyfill(b64: string): Uint8Array {
  const lookup = new Uint8Array(256).fill(255);
  for (let i = 0; i < _B64_CHARS.length; i++) {
    lookup[_B64_CHARS.charCodeAt(i)] = i;
  }
  const clean = b64.replace(/=+$/, '');
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let byteIdx = 0;
  for (let i = 0; i < len; i += 4) {
    const e0 = lookup[clean.charCodeAt(i)]!;
    const e1 = lookup[clean.charCodeAt(i + 1)]!;
    const e2 = i + 2 < len ? lookup[clean.charCodeAt(i + 2)]! : 0;
    const e3 = i + 3 < len ? lookup[clean.charCodeAt(i + 3)]! : 0;
    bytes[byteIdx++] = (e0 << 2) | (e1 >> 4);
    if (i + 2 < len) bytes[byteIdx++] = ((e1 & 15) << 4) | (e2 >> 2);
    if (i + 3 < len) bytes[byteIdx++] = ((e2 & 3) << 6) | e3;
  }
  return bytes.slice(0, byteIdx);
}

// Re-export type guard for convenience
export { isSignChallengeRequest };
export type { SignChallengeRequest };

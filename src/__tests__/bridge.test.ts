/**
 * Unit tests for EmbedBridge — focusing on the incoming request handler side
 * (cherry:request from iframe → host handler → cherry:response back to iframe).
 *
 * The test harness simulates the iframe by:
 *  1. Posting fake MessageEvent objects to window.
 *  2. Capturing postMessage calls on a mock iframe contentWindow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbedBridge, EmbedBridgeError, base64ToBytes, bytesToBase64 } from '../bridge';
import type { BridgeRequest, BridgeResponse, BridgeCommand } from '../types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const EMBED_ORIGIN = 'https://embed.cherry.fun';

/** Creates a fake HTMLIFrameElement whose postMessage calls are captured. */
function createFakeIframe() {
  const posted: { message: unknown; targetOrigin: string }[] = [];
  const contentWindow = {
    postMessage(message: unknown, targetOrigin: string) {
      posted.push({ message, targetOrigin });
    },
  };

  const iframe = {
    contentWindow,
  } as unknown as HTMLIFrameElement;

  return { iframe, posted };
}

/** Dispatches a fake MessageEvent from `origin` with the given data. */
function dispatchMessage(origin: string, data: unknown): void {
  const event = new MessageEvent('message', { data, origin });
  window.dispatchEvent(event);
}

/** Like dispatchMessage but with an explicit event.source. Built via
 *  Object.assign because the MessageEvent init rejects plain fakes. */
function dispatchMessageFrom(source: unknown, origin: string, data: unknown): void {
  const event = Object.assign(new Event('message'), { data, origin, source });
  window.dispatchEvent(event as MessageEvent);
}

/** Dispatch a cherry:request from the embed origin. */
function dispatchRequest(req: Omit<BridgeRequest, 'type'>): void {
  dispatchMessage(EMBED_ORIGIN, { type: 'cherry:request', ...req });
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

describe('base64ToBytes / bytesToBase64', () => {
  it('round-trips arbitrary bytes', () => {
    const original = new Uint8Array([0, 1, 2, 128, 255, 42, 99]);
    const encoded = bytesToBase64(original);
    const decoded = base64ToBytes(encoded);
    expect(decoded).toEqual(original);
  });

  it('handles empty array', () => {
    const empty = new Uint8Array(0);
    expect(base64ToBytes(bytesToBase64(empty))).toEqual(empty);
  });
});

// ---------------------------------------------------------------------------
// Incoming request routing
// ---------------------------------------------------------------------------

describe('EmbedBridge — incoming request routing', () => {
  let bridge: EmbedBridge;
  let posted: { message: unknown; targetOrigin: string }[];
  let iframe: HTMLIFrameElement;

  beforeEach(() => {
    const fake = createFakeIframe();
    posted = fake.posted;
    iframe = fake.iframe;
    bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);
  });

  afterEach(() => {
    bridge.destroy();
  });

  it('calls the registered handler and sends a cherry:response', async () => {
    bridge.onIncomingRequest('ping', async () => ({ pong: true }));

    dispatchRequest({ id: 'req-1', method: 'signChallenge', params: {} });

    // The bridge has no signChallenge handler yet — expect METHOD_NOT_FOUND
    // (wait for async dispatch)
    await vi.waitFor(() => posted.length > 0);
    const resp = posted[0]!.message as BridgeResponse;
    expect(resp.type).toBe('cherry:response');
    expect(resp.id).toBe('req-1');
    expect(resp.error?.code).toBe('METHOD_NOT_FOUND');
  });

  it('dispatches to the correct handler and returns result', async () => {
    bridge.onIncomingRequest('signChallenge', async (_params) => ({ signature: 'abc123' }));

    dispatchRequest({ id: 'req-2', method: 'signChallenge', params: { message: 'aGVsbG8=' } });

    await vi.waitFor(() => posted.length > 0);
    const resp = posted[0]!.message as BridgeResponse;
    expect(resp.type).toBe('cherry:response');
    expect(resp.id).toBe('req-2');
    expect(resp.result).toEqual({ signature: 'abc123' });
    expect(resp.error).toBeUndefined();
  });

  it('returns HANDLER_ERROR when the handler rejects', async () => {
    bridge.onIncomingRequest('signChallenge', async () => {
      throw new Error('User rejected');
    });

    dispatchRequest({ id: 'req-3', method: 'signChallenge', params: { message: 'aGVsbG8=' } });

    await vi.waitFor(() => posted.length > 0);
    const resp = posted[0]!.message as BridgeResponse;
    expect(resp.error?.code).toBe('HANDLER_ERROR');
    expect(resp.error?.message).toBe('User rejected');
  });

  it('sends METHOD_NOT_FOUND when no handler is registered', async () => {
    dispatchRequest({ id: 'req-4', method: 'signChallenge', params: {} });

    await vi.waitFor(() => posted.length > 0);
    const resp = posted[0]!.message as BridgeResponse;
    expect(resp.error?.code).toBe('METHOD_NOT_FOUND');
  });

  it('removes the handler after offIncomingRequest', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    bridge.onIncomingRequest('signChallenge', handler);
    bridge.offIncomingRequest('signChallenge');

    dispatchRequest({ id: 'req-5', method: 'signChallenge', params: {} });

    await vi.waitFor(() => posted.length > 0);
    expect(handler).not.toHaveBeenCalled();
    const resp = posted[0]!.message as BridgeResponse;
    expect(resp.error?.code).toBe('METHOD_NOT_FOUND');
  });

  it('ignores messages from wrong origins', async () => {
    const handler = vi.fn().mockResolvedValue({});
    bridge.onIncomingRequest('signChallenge', handler);

    // Dispatch from wrong origin
    dispatchMessage('https://evil.example.com', {
      type: 'cherry:request',
      id: 'req-evil',
      method: 'signChallenge',
      params: { message: 'aGVsbG8=' },
    });

    // Give async dispatch a chance to run
    await new Promise<void>((r) => setTimeout(r, 20));

    expect(handler).not.toHaveBeenCalled();
    expect(posted).toHaveLength(0);
  });

  it('ignores messages whose source is a different window', async () => {
    const handler = vi.fn().mockResolvedValue({});
    bridge.onIncomingRequest('signChallenge', handler);

    // Right origin, but sent by some other window (e.g. a second embed)
    dispatchMessageFrom({ postMessage() {} }, EMBED_ORIGIN, {
      type: 'cherry:request',
      id: 'req-foreign',
      method: 'signChallenge',
      params: { message: 'aGVsbG8=' },
    });

    await new Promise<void>((r) => setTimeout(r, 20));

    expect(handler).not.toHaveBeenCalled();
    expect(posted).toHaveLength(0);
  });

  it('accepts messages whose source is the iframe contentWindow', async () => {
    bridge.onIncomingRequest('signChallenge', async () => ({ signature: 'sig' }));

    dispatchMessageFrom(iframe.contentWindow, EMBED_ORIGIN, {
      type: 'cherry:request',
      id: 'req-own-window',
      method: 'signChallenge',
      params: { message: 'aGVsbG8=' },
    });

    await vi.waitFor(() => posted.length > 0);
    const resp = posted[0]!.message as BridgeResponse;
    expect(resp.id).toBe('req-own-window');
    expect(resp.error).toBeUndefined();
  });

  it('sends response to iframe with the embed origin as targetOrigin', async () => {
    bridge.onIncomingRequest('signChallenge', async () => ({ signature: 'sig' }));

    dispatchRequest({ id: 'req-6', method: 'signChallenge', params: { message: 'aGVsbG8=' } });

    await vi.waitFor(() => posted.length > 0);
    expect(posted[0]!.targetOrigin).toBe(EMBED_ORIGIN);
  });

  it('handles malformed request (missing id) gracefully', async () => {
    // Should not crash; dispatch an object without id
    dispatchMessage(EMBED_ORIGIN, { type: 'cherry:request', method: 'signChallenge' });
    await new Promise<void>((r) => setTimeout(r, 20));
    // No response should have been sent (guard rejects it)
    expect(posted).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Timeout behaviour
// ---------------------------------------------------------------------------

describe('EmbedBridge — incoming request timeout', () => {
  it('sends HANDLER_TIMEOUT when handler hangs', async () => {
    vi.useFakeTimers();

    const fake = createFakeIframe();
    const bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);

    // Handler that never resolves
    bridge.onIncomingRequest('signChallenge', () => new Promise(() => { /* never */ }));

    dispatchRequest({ id: 'req-timeout', method: 'signChallenge', params: { message: 'aGVsbG8=' } });

    // Advance past the 60 s timeout
    await vi.advanceTimersByTimeAsync(61_000);

    bridge.destroy();
    vi.useRealTimers();

    const resp = fake.posted[0]!.message as BridgeResponse;
    expect(resp.error?.code).toBe('HANDLER_TIMEOUT');
    expect(resp.id).toBe('req-timeout');
  });
});

// ---------------------------------------------------------------------------
// Outbound request / response correlation (existing behaviour, regression)
// ---------------------------------------------------------------------------

describe('EmbedBridge — outbound sendRequest regression', () => {
  it('rejects with EmbedBridgeError on timeout', async () => {
    vi.useFakeTimers();

    const fake = createFakeIframe();
    const bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);

    // Attach .catch immediately to prevent unhandled rejection before timers fire
    let capturedError: unknown;
    const promise = bridge.sendRequest('someMethod').catch((e: unknown) => {
      capturedError = e;
    });

    await vi.advanceTimersByTimeAsync(31_000);
    await promise;

    expect(capturedError).toBeInstanceOf(EmbedBridgeError);
    expect((capturedError as EmbedBridgeError).code).toBe('TIMEOUT');

    bridge.destroy();
    vi.useRealTimers();
  });

  it('resolves when matching cherry:response arrives', async () => {
    const fake = createFakeIframe();
    const bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);

    const promise = bridge.sendRequest('ping');

    // The bridge posted a cherry:request to the iframe; capture its id
    await vi.waitFor(() => fake.posted.length > 0);
    const sentRequest = fake.posted[0]!.message as BridgeRequest;
    const id = sentRequest.id;

    // Simulate iframe responding
    const response: BridgeResponse = { type: 'cherry:response', id, result: { pong: true } };
    dispatchMessage(EMBED_ORIGIN, response);

    await expect(promise).resolves.toEqual({ pong: true });

    bridge.destroy();
  });
});

// ---------------------------------------------------------------------------
// Event forwarding (regression)
// ---------------------------------------------------------------------------

describe('EmbedBridge — event forwarding regression', () => {
  it('forwards cherry:event to registered handlers', () => {
    const fake = createFakeIframe();
    const bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);

    const callback = vi.fn();
    bridge.onEvent('ready', callback);

    dispatchMessage(EMBED_ORIGIN, { type: 'cherry:event', event: 'ready' });

    expect(callback).toHaveBeenCalledOnce();

    bridge.destroy();
  });
});

// ---------------------------------------------------------------------------
// destroy()
// ---------------------------------------------------------------------------

describe('EmbedBridge — destroy()', () => {
  it('no longer processes messages after destroy', async () => {
    const fake = createFakeIframe();
    const bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);

    const handler = vi.fn().mockResolvedValue({});
    bridge.onIncomingRequest('signChallenge', handler);

    bridge.destroy();

    dispatchRequest({ id: 'req-post-destroy', method: 'signChallenge', params: { message: 'aGVsbG8=' } });
    await new Promise<void>((r) => setTimeout(r, 20));

    expect(handler).not.toHaveBeenCalled();
  });
});

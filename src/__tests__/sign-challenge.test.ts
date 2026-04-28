/**
 * Integration-level tests for the signChallenge bridge flow.
 *
 * These tests exercise the full path:
 *   iframe sends cherry:request signChallenge
 *   → bridge decodes base64 message
 *   → calls the registered SignChallengeHandler with Uint8Array
 *   → encodes returned Uint8Array back to base64
 *   → posts cherry:response to iframe
 *
 * The EmbedBridge is instantiated directly (without CherryEmbed) so we can
 * test the handler wiring in isolation without a DOM/iframe setup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbedBridge, base64ToBytes, bytesToBase64 } from '../bridge';
import type { BridgeResponse } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMBED_ORIGIN = 'https://embed.cherry.fun';

function createFakeIframe() {
  const posted: { message: unknown; targetOrigin: string }[] = [];
  const contentWindow = {
    postMessage(message: unknown, targetOrigin: string) {
      posted.push({ message, targetOrigin });
    },
  };
  return {
    iframe: { contentWindow } as unknown as HTMLIFrameElement,
    posted,
  };
}

function dispatchSignChallengeRequest(id: string, messageBase64: string): void {
  const event = new MessageEvent('message', {
    origin: EMBED_ORIGIN,
    data: {
      type: 'cherry:request',
      id,
      method: 'signChallenge',
      params: { message: messageBase64 },
    },
  });
  window.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('signChallenge handler — happy path', () => {
  let bridge: EmbedBridge;
  let posted: { message: unknown; targetOrigin: string }[];

  beforeEach(() => {
    const fake = createFakeIframe();
    posted = fake.posted;
    bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);
  });

  afterEach(() => {
    bridge.destroy();
  });

  it('receives params and sends back a response', async () => {
    const challengeBytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const challengeBase64 = bytesToBase64(challengeBytes);

    // Handler reverses bytes deterministically
    bridge.onIncomingRequest<{ message: string }, { signature: string }>(
      'signChallenge',
      async (params) => {
        const msg = base64ToBytes(params.message);
        const reversed = msg.slice().reverse();
        return { signature: bytesToBase64(reversed) };
      },
    );

    dispatchSignChallengeRequest('sc-1', challengeBase64);

    await vi.waitFor(() => posted.length > 0);

    const resp = posted[0]!.message as BridgeResponse;
    expect(resp.type).toBe('cherry:response');
    expect(resp.id).toBe('sc-1');
    expect(resp.error).toBeUndefined();

    // Verify signature is the reversed bytes encoded back to base64
    const expectedSig = bytesToBase64(challengeBytes.slice().reverse());
    const result = resp.result as { signature: string };
    expect(result.signature).toBe(expectedSig);
  });

  it('decodes and re-encodes arbitrary binary content', async () => {
    const binaryMsg = new Uint8Array([0x00, 0xff, 0xfe, 0x80, 0x01]);
    const b64 = bytesToBase64(binaryMsg);

    bridge.onIncomingRequest<{ message: string }, { signature: string }>(
      'signChallenge',
      async (params) => {
        const msg = base64ToBytes(params.message);
        // Echo back all-0xab bytes of the same length
        return { signature: bytesToBase64(new Uint8Array(msg.length).fill(0xab)) };
      },
    );

    dispatchSignChallengeRequest('sc-bin', b64);

    await vi.waitFor(() => posted.length > 0);

    const resp = posted[0]!.message as BridgeResponse;
    expect(resp.error).toBeUndefined();
    const result = resp.result as { signature: string };
    expect(base64ToBytes(result.signature)).toEqual(new Uint8Array(5).fill(0xab));
  });
});

// ---------------------------------------------------------------------------
// Error path
// ---------------------------------------------------------------------------

describe('signChallenge handler — error path', () => {
  it('sends HANDLER_ERROR when wallet rejects signing', async () => {
    const fake = createFakeIframe();
    const bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);

    bridge.onIncomingRequest('signChallenge', async () => {
      throw new Error('User rejected the request');
    });

    const msg = bytesToBase64(new Uint8Array([1, 2, 3]));
    dispatchSignChallengeRequest('sc-reject', msg);

    await vi.waitFor(() => fake.posted.length > 0);

    const resp = fake.posted[0]!.message as BridgeResponse;
    expect(resp.error?.code).toBe('HANDLER_ERROR');
    expect(resp.error?.message).toBe('User rejected the request');
    expect(resp.result).toBeUndefined();

    bridge.destroy();
  });

  it('sends HANDLER_ERROR for non-Error throws (string)', async () => {
    const fake = createFakeIframe();
    const bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);

    bridge.onIncomingRequest('signChallenge', async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string error';
    });

    const msg = bytesToBase64(new Uint8Array([1]));
    dispatchSignChallengeRequest('sc-string-throw', msg);

    await vi.waitFor(() => fake.posted.length > 0);

    const resp = fake.posted[0]!.message as BridgeResponse;
    expect(resp.error?.code).toBe('HANDLER_ERROR');
    expect(resp.error?.message).toBe('string error');

    bridge.destroy();
  });

  it('sends METHOD_NOT_FOUND when no handler registered', async () => {
    const fake = createFakeIframe();
    const bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);

    const msg = bytesToBase64(new Uint8Array([1]));
    dispatchSignChallengeRequest('sc-no-handler', msg);

    await vi.waitFor(() => fake.posted.length > 0);

    const resp = fake.posted[0]!.message as BridgeResponse;
    expect(resp.error?.code).toBe('METHOD_NOT_FOUND');

    bridge.destroy();
  });
});

// ---------------------------------------------------------------------------
// Timeout path
// ---------------------------------------------------------------------------

describe('signChallenge handler — timeout', () => {
  it('sends HANDLER_TIMEOUT if handler never resolves', async () => {
    vi.useFakeTimers();

    const fake = createFakeIframe();
    const bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);

    // Handler that hangs indefinitely (simulates user ignoring wallet popup)
    bridge.onIncomingRequest('signChallenge', () => new Promise<never>(() => { /* hang */ }));

    const msg = bytesToBase64(new Uint8Array([42]));
    dispatchSignChallengeRequest('sc-timeout', msg);

    // Advance past the 60 s timeout in bridge.ts
    await vi.advanceTimersByTimeAsync(61_000);

    bridge.destroy();
    vi.useRealTimers();

    expect(fake.posted).toHaveLength(1);
    const resp = fake.posted[0]!.message as BridgeResponse;
    expect(resp.error?.code).toBe('HANDLER_TIMEOUT');
    expect(resp.id).toBe('sc-timeout');
  });
});

// ---------------------------------------------------------------------------
// Multiple concurrent requests
// ---------------------------------------------------------------------------

describe('signChallenge handler — concurrent requests', () => {
  it('handles two simultaneous requests with independent ids', async () => {
    const fake = createFakeIframe();
    const bridge = new EmbedBridge(fake.iframe, EMBED_ORIGIN);

    let callCount = 0;
    bridge.onIncomingRequest<{ message: string }, { signature: string }>(
      'signChallenge',
      async (params) => {
        callCount++;
        const msgBytes = base64ToBytes(params.message);
        // Echo back message as "signature" for easy verification
        return { signature: bytesToBase64(msgBytes) };
      },
    );

    const msg1 = bytesToBase64(new Uint8Array([1]));
    const msg2 = bytesToBase64(new Uint8Array([2]));

    dispatchSignChallengeRequest('sc-a', msg1);
    dispatchSignChallengeRequest('sc-b', msg2);

    await vi.waitFor(() => fake.posted.length >= 2);

    expect(callCount).toBe(2);

    const byId = Object.fromEntries(
      fake.posted.map((p) => {
        const r = p.message as BridgeResponse;
        return [r.id, r];
      }),
    );

    expect(byId['sc-a']?.error).toBeUndefined();
    expect(byId['sc-b']?.error).toBeUndefined();

    // Each response echoes back the corresponding input
    expect((byId['sc-a']?.result as { signature: string }).signature).toBe(msg1);
    expect((byId['sc-b']?.result as { signature: string }).signature).toBe(msg2);

    bridge.destroy();
  });
});

// ---------------------------------------------------------------------------
// type-guard test
// ---------------------------------------------------------------------------

describe('isSignChallengeRequest type guard', () => {
  it('validates correct signChallenge request', async () => {
    const { isSignChallengeRequest } = await import('../types');

    const valid = {
      type: 'cherry:request' as const,
      id: 'id-1',
      method: 'signChallenge' as const,
      params: { message: 'aGVsbG8=' },
    };
    expect(isSignChallengeRequest(valid)).toBe(true);
  });

  it('rejects request with missing message param', async () => {
    const { isSignChallengeRequest } = await import('../types');

    const invalid = {
      type: 'cherry:request' as const,
      id: 'id-2',
      method: 'signChallenge' as const,
      params: {},
    };
    expect(isSignChallengeRequest(invalid)).toBe(false);
  });

  it('rejects request with non-string message', async () => {
    const { isSignChallengeRequest } = await import('../types');

    const invalid = {
      type: 'cherry:request' as const,
      id: 'id-3',
      method: 'signChallenge' as const,
      params: { message: 123 },
    };
    expect(isSignChallengeRequest(invalid as Parameters<typeof isSignChallengeRequest>[0])).toBe(false);
  });
});

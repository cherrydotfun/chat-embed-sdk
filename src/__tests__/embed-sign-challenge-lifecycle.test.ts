import { describe, expect, it, vi } from 'vitest';
import { CherryEmbed } from '../embed';
import { bytesToBase64 } from '../bridge';
import type { BridgeResponse, CherryEmbedConfig } from '../types';

const EMBED_ORIGIN = 'https://embed.cherry.fun';

function dispatchFromEmbed(data: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: EMBED_ORIGIN,
      data,
    }),
  );
}

describe('CherryEmbed signChallenge lifecycle', () => {
  it('registers a configured signChallenge handler before initial auth commands can trigger signing', async () => {
    if (!('sandbox' in HTMLIFrameElement.prototype)) {
      Object.defineProperty(HTMLIFrameElement.prototype, 'sandbox', {
        configurable: true,
        get() {
          return { add: vi.fn() };
        },
      });
    }

    const container = document.createElement('div');
    document.body.appendChild(container);

    const signatureBytes = new Uint8Array([9, 8, 7, 6]);
    const signChallengeHandler = vi.fn(async () => signatureBytes);

    const chat = new CherryEmbed({
      appId: 'app-1',
      container,
      token: 'embed.token.value',
      walletAddress: 'Wallet111111111111111111111111111111111',
      embedUrl: EMBED_ORIGIN,
      signChallengeHandler,
    } as CherryEmbedConfig);

    const mountPromise = chat.mount();

    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    const postMessageSpy = vi.spyOn(iframe!.contentWindow!, 'postMessage');

    dispatchFromEmbed({ type: 'cherry:event', event: 'ready' });
    await mountPromise;

    dispatchFromEmbed({
      type: 'cherry:request',
      id: 'sign-1',
      method: 'signChallenge',
      params: { message: bytesToBase64(new Uint8Array([1, 2, 3])) },
    });

    await vi.waitFor(() => {
      const response = postMessageSpy.mock.calls
        .map((call) => call[0] as BridgeResponse)
        .find((msg) => msg.type === 'cherry:response' && msg.id === 'sign-1');
      expect(response?.result).toEqual({
        signature: bytesToBase64(signatureBytes),
      });
      expect(response?.error).toBeUndefined();
    });

    expect(signChallengeHandler).toHaveBeenCalledTimes(1);
    chat.destroy();
    container.remove();
  });
});

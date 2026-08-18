/**
 * jsdom 29 reflects neither `HTMLIFrameElement.sandbox` (a DOMTokenList in the
 * browser) nor `.allow`, so the real `createEmbedIframe` throws under the test
 * environment. Import this module for its side effect to run it for real
 * instead of mocking it away.
 */

if (!('sandbox' in document.createElement('iframe'))) {
  Object.defineProperty(HTMLIFrameElement.prototype, 'sandbox', {
    configurable: true,
    get(this: HTMLIFrameElement) {
      const el = this;
      return {
        add: (...tokens: string[]) => {
          const current = (el.getAttribute('sandbox') ?? '').split(' ').filter(Boolean);
          el.setAttribute('sandbox', [...new Set([...current, ...tokens])].join(' '));
        },
      };
    },
  });
}

if (!('allow' in document.createElement('iframe'))) {
  Object.defineProperty(HTMLIFrameElement.prototype, 'allow', {
    configurable: true,
    get(this: HTMLIFrameElement) {
      return this.getAttribute('allow') ?? '';
    },
    set(this: HTMLIFrameElement, value: string) {
      this.setAttribute('allow', value);
    },
  });
}

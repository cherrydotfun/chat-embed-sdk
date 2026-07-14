# Cherry Embed — React Native example

`@cherrydotfun/chat-embed-sdk` is a **browser-only** SDK — it builds an
`<iframe>` and talks to it over `window.postMessage`, neither of which exists in
the React Native JS runtime. To embed Cherry Chat in React Native you run the
SDK inside a [`react-native-webview`](https://github.com/react-native-webview/react-native-webview)
on a tiny **host page**, and bridge the wallet signature out to the native layer
(Mobile Wallet Adapter on Android / a deeplink wallet on iOS).

```
RN (native wallet: MWA / deeplink)
   │  injectJavaScript  ↑↓  onMessage
   ▼
WebView → host page (runs CherryEmbed SDK, creates the iframe)
   ▼
iframe → embed.cherry.fun (the chat)
```

> **Do not point the WebView at `embed.cherry.fun` directly.** The SDK's
> `signChallenge` bridge rejects when `window.parent === window`, so the embed
> must be nested in an iframe on a host page — never the top-level document.

Full write-up: [`../../docs/react-native.md`](../../docs/react-native.md).

## Files

| File | Role |
|---|---|
| `CherryChatWebView.tsx` | Reusable RN component. Handshake, config, event forwarding, and the sign bridge. Delivery-agnostic (`{uri}` or `{html}`). |
| `wallet.ts` | Native signing stubs — wire to Mobile Wallet Adapter (Android) / deeplink (iOS). |
| `host.html` | **Example 1** — host page you deploy to your web server. |
| `App.hosted.tsx` | **Example 1** usage: `source={{ uri }}` + `app-trusted+wallet`. |
| `cherryHostHtml.ts` | **Example 2** — host page bundled as a string in your repo. |
| `App.bundled.tsx` | **Example 2** usage: `source={{ html }}` + `wallet-only`. |

## Two ways to ship the host page

### Example 1 — Hosted (`host.html` + `App.hosted.tsx`)

The host page lives on your web server. Best when you already have web hosting
and want to update the host page without shipping an app release.

```bash
cd cherry-embed-sdk && npm run build
cp dist/index.global.js  <web-root>/cherry-embed.js   # SDK bundle
cp example/react-native/host.html  <web-root>/cherry-host.html
```

```tsx
<CherryChatWebView source={{ uri: 'https://yoursite.com/cherry-host.html' }} ... />
```

Add `https://yoursite.com` to your embed app's **Allowed Origins** in the Cherry
Admin Panel.

### Example 2 — Bundled (`cherryHostHtml.ts` + `App.bundled.tsx`)

The host page ships inside the RN bundle — no separate web deploy. The SDK
bundle and the chat iframe are still fetched over the network (the chat is a
hosted iframe), so you point `sdkUrl` at a `cherry-embed.js`. The example uses
the Cherry-hosted rolling bundle (same origin as the chat iframe):

```tsx
const html = buildCherryHostHtml({ sdkUrl: 'https://embed.cherry.fun/cherry-embed.js' });
<CherryChatWebView source={{ html }} ... />
```

## Hosting the SDK bundle (`cherry-embed.js`)

`cherry-embed.js` is the SDK's IIFE build (`dist/index.global.js`, exposes
`window.CherryEmbedSDK`, ~10 KB).

- **Cherry-hosted (default):** `https://embed.cherry.fun/cherry-embed.js` — a
  rolling URL served from the embed app's static (`messaging-server/embed/public/`),
  refreshed on each embed deploy, short-cached (5 min). Nothing to host yourself.
- **Self-hosted:** build it and put it next to your host page (Example 1) or on
  any static host / CDN (Example 2):
  ```bash
  cd cherry-embed-sdk && npm run build
  cp dist/index.global.js  <your-web-root>/cherry-embed.js
  ```
  Serve it as `application/javascript`. Pin a hashed filename
  (`cherry-embed-<version>.js`) if you need a frozen version.

For a fully offline host page, inline the SDK bundle — see the note at the
bottom of `cherryHostHtml.ts`. With `source={{ html }}` there is no page origin,
so add **`null`** (or your app's scheme) to Allowed Origins, or prefer Example 1.

## Prerequisites

```bash
npm install react-native-webview
# Android wallet signing:
npm install @solana-mobile/mobile-wallet-adapter-protocol-web3js @solana/web3.js
```

- A Cherry embed app registered in the Admin Panel (`wallet-only` or
  `app-trusted+wallet`), with your host origin in **Allowed Origins**.
- `app-trusted+wallet` also needs a backend endpoint that mints the embed token
  (see [`../app-trusted+wallet/server.js`](../app-trusted%2Bwallet/server.js)).

## Wiring your wallet

`wallet.ts` ships as stubs. Implement `connectWallet()` and
`signMessageWithWallet()` against your wallet stack. The signature must be the
raw 64-byte Ed25519 signature over the challenge bytes **as-is** (no re-hash,
no prefix).

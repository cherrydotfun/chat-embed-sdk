# React Native integration

`@cherrydotfun/chat-embed-sdk` runs in the browser. It creates an `<iframe>`
via `document`, listens on `window` `message` events, and posts to
`iframe.contentWindow`. React Native has none of those, so `CherryEmbed` cannot
run directly in the RN JS runtime. This guide shows the supported approach:
run the SDK inside a WebView and bridge wallet signing to the native layer.

> **Flutter:** the exact same architecture and bridge protocol apply — only the
> WebView plumbing differs (`webview_flutter`'s `JavaScriptChannel` +
> `runJavaScript` instead of RN's `postMessage`/`injectJavaScript`, and Dart's
> `dart:convert` `base64` instead of hand-rolled helpers). The host page
> auto-detects the platform, so one page serves both. See the
> [Flutter section](#flutter) below and [`../example/flutter/`](../example/flutter/).

Runnable code: [`../example/react-native/`](../example/react-native/) ·
[`../example/flutter/`](../example/flutter/).

## Why `signChallenge` fails in a naive setup

Three separate reasons people hit, in order of how often:

1. **The SDK is DOM-only.** Importing `CherryEmbed` into RN and calling
   `mount()` throws — there is no `document`/`iframe`. The SDK must live in a
   WebView, not in RN.

2. **The embed requires a parent frame.** If you load `embed.cherry.fun`
   *directly* as the WebView's top document, the iframe-side bridge sees
   `window.parent === window` and refuses to send the `signChallenge` request
   at all — so signing never even starts. The embed must be nested in an
   iframe on a host page.

3. **There is no `window.phantom` in a mobile WebView.** The docs' browser
   example signs with `window.phantom.solana.signMessage`. On mobile the wallet
   lives in the native layer (Mobile Wallet Adapter on Android, deeplinks on
   iOS), so the signature must cross the WebView → native boundary.

## Architecture

```
RN (native wallet: MWA / deeplink)
   │  injectJavaScript  ↑↓  onMessage
   ▼
WebView → host page (runs CherryEmbed SDK, creates the iframe)
   ▼
iframe → embed.cherry.fun (the chat)
```

- **Host page** — a minimal HTML page that loads the SDK bundle and calls
  `new CherryEmbed({ ... })`. Its `signChallengeHandler` does **not** sign; it
  forwards the challenge bytes to native and awaits the signature.
- **Native (RN)** — a WebView wrapper that sends config down, receives sign
  requests, signs with the real wallet, and injects the signature back.

## Bridge protocol (native ↔ host page)

Native → host page (via `webView.injectJavaScript`), global functions on the page:

| Call | Purpose |
|---|---|
| `window.__cherryReceiveConfig(jsonString)` | Deliver config and mount / remount the chat. |
| `window.__cherrySignResult(id, signatureB64, errorOrNull)` | Resolve a pending `signChallenge`. |
| `window.__cherryCommand(method, paramsJson)` | Imperative SDK calls: `setWalletAddress`, `setToken`, `setRoom`, `setTheme`, `signOut`, `show`, `hide`. |

Host page → native (via `window.ReactNativeWebView.postMessage`, JSON):

| Message | Meaning |
|---|---|
| `{ type: 'ready' }` | Page loaded; ready for config. Native replies with `__cherryReceiveConfig`. |
| `{ type: 'sign', id, message }` | `signChallenge` fired. `message` is base64 challenge bytes. Native signs and replies with `__cherrySignResult`. |
| `{ type: 'event', event, data }` | Forwarded SDK event (`ready`, `mounted`, `authStateChange`, `unreadCount`, `message`, `tokenExpired`, `error`, `walletConnectRequested`, `preview`, `roomChanged`). |

`CherryChatWebView.tsx` implements this whole protocol; `host.html` /
`cherryHostHtml.ts` implement the page side.

## Choosing where the host page lives

| | Example 1 — Hosted | Example 2 — Bundled |
|---|---|---|
| File | `host.html` on your web server | `cherryHostHtml.ts` string in your repo |
| WebView source | `source={{ uri }}` | `source={{ html }}` |
| Update host page | redeploy web, no app release | ship an app release |
| Page origin | your https origin | none (`null`) |
| Allowed Origins entry | `https://yoursite.com` | `null` (or prefer Example 1) |

Both fetch the SDK bundle and the chat iframe over the network — the chat is a
hosted iframe, so a device with no connectivity cannot show it either way.

## Hosting the SDK bundle (`cherry-embed.js`)

The host page loads the SDK as a global (`window.CherryEmbedSDK`). That file is
the IIFE build — `dist/index.global.js` from `npm run build` (~10 KB).

| Option | URL | When |
|---|---|---|
| Cherry-hosted (default) | `https://embed.cherry.fun/cherry-embed.js` | Easiest. Rolling URL served from the embed app's static (`messaging-server/embed/public/cherry-embed.js`), refreshed on each embed deploy, short-cached (5 min). Same origin as the chat iframe. |
| Next to your host page | `./cherry-embed.js` | Example 1 only — `source={{ uri }}` resolves relative paths. `cp dist/index.global.js <web-root>/cherry-embed.js`. |
| Your own CDN | `https://cdn.yoursite.com/cherry-embed.js` | Full control / version pinning. Serve as `application/javascript`; pin a hashed name if you need a frozen version. |

The rolling default tracks the latest embed release. If you must guarantee a
specific SDK version, self-host a hashed copy and point `sdkUrl` / the
`<script src>` at it.

## Auth modes on mobile

- **`wallet-only`** — no backend, no token. Pass `walletAddress` + wire
  `onSign`. Do **not** rely on the iframe's built-in web wallet adapter on
  mobile; drive signing natively via `onSign`. (`App.bundled.tsx`.)
- **`app-trusted+wallet`** — backend mints a short-lived embed `token` bound to
  the wallet; user also signs the challenge. Pass `token` + `walletAddress` +
  `onSign`. (`App.hosted.tsx`.)
- **`app-trusted`** — token only, no signature; `onSign` never fires. Same as
  Example 1 without the wallet/sign parts.

## Wiring the wallet (`wallet.ts`)

Implement two functions:

- `connectWallet(): Promise<string>` → base58 public key.
- `signMessageWithWallet(bytes: Uint8Array): Promise<Uint8Array>` → raw 64-byte
  Ed25519 signature over `bytes` **as-is**. The Cherry server verifies
  `ed25519.verify(signature, challengeBytes, walletPublicKey)`, so do not
  re-hash or prefix.

Android uses `@solana-mobile/mobile-wallet-adapter-protocol-web3js`
(`wallet.signMessages`); iOS uses a deeplink wallet's `signMessage` (decode its
base58 signature to bytes). MWA's `signMessages` may return the message with the
signature appended — slice the last 64 bytes when the result is longer.

## Gotchas

- **Register `signChallengeHandler` in the constructor**, not after `mount()` —
  the first challenge can fire before a late handler is attached. The host page
  already does this.
- **60-second sign timeout.** The bridge auto-fails a `signChallenge` after 60s
  (`INCOMING_REQUEST_TIMEOUT_MS`). Native wallet round-trips (app switch, MWA
  intent) usually fit; just don't block on your own UI longer than that.
- **Signature format.** `onSign` returns `Uint8Array` (raw 64 bytes). The
  bridge handles base64 on the wire — don't return base58/hex/strings.
- **Allowed Origins.** The host page's origin must be in the app's Allowed
  Origins, else the iframe bridge drops host commands (fail-secure). localhost
  is always allowed for local testing.
- **Cookies / storage.** The Cherry JWT lives in the iframe's `sessionStorage`;
  keep `domStorageEnabled` on. Sessions are short-lived by design (~15 min JWT).
- **iOS deeplinks navigate away and back.** Handle the return via your universal
  link handler and resolve the pending `onSign`/`connectWallet` promise there.

## Flutter

Everything above applies unchanged — same host page, same bridge protocol, same
auth modes and gotchas. Only the WebView plumbing is Flutter-specific.

| Concern | React Native | Flutter (`webview_flutter`) |
|---|---|---|
| Page → native | `window.ReactNativeWebView.postMessage` + `onMessage` | `JavaScriptChannel('CherryNative')`; page calls `CherryNative.postMessage`, native gets `onMessageReceived` |
| Native → page | `webview.injectJavaScript(js)` | `controller.runJavaScript(js)` |
| Load hosted page | `source={{ uri }}` | `controller.loadRequest(Uri.parse(url))` |
| Load bundled page | `source={{ html }}` | `controller.loadHtmlString(html, baseUrl: ...)` |
| base64 | hand-rolled helpers | `dart:convert` `base64` |

Key points specific to Flutter:

- **Channel name must be `CherryNative`.** The shared host page tries
  `window.ReactNativeWebView` first, then `window.CherryNative` — so name the
  `JavaScriptChannel` exactly `CherryNative`.
- **`JavaScriptMode.unrestricted`** is required; set a transparent background
  (`setBackgroundColor(Color(0x00000000))`) if your page is transparent.
- **`loadHtmlString` needs a `baseUrl`** on iOS/WKWebView so the null-origin
  document may load the remote SDK `<script src>`. Set it to the SDK origin
  (e.g. `https://embed.cherry.fun`).
- **Wallet signing:** Android via `solana_mobile_client` (MWA); iOS via a
  Phantom deeplink (encrypted x25519 handshake), with the redirect routed back
  through `app_links` to resolve the pending signature.

Runnable code and full platform setup (AndroidManifest `<queries>`, iOS
`Info.plist` URL schemes): [`../example/flutter/`](../example/flutter/).

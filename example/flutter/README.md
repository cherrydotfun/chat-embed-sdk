# Cherry Embed — Flutter example

`@cherrydotfun/chat-embed-sdk` is a **browser-only** SDK — it builds an
`<iframe>` and talks to it over `window.postMessage`, neither of which exists in
Dart. To embed Cherry Chat in Flutter you run the SDK inside a
[`webview_flutter`](https://pub.dev/packages/webview_flutter) WebView on a small
**host page**, and bridge the wallet signature out to the native layer
(Mobile Wallet Adapter on Android / Phantom deeplink on iOS).

```
Flutter (native wallet: MWA / Phantom deeplink)
   │  runJavaScript  ↑↓  JavaScriptChannel("CherryNative")
   ▼
WebView → host page (runs CherryEmbed SDK, creates the iframe)
   ▼
iframe → embed.cherry.fun (the chat)
```

> **Do not point the WebView at `embed.cherry.fun` directly.** The SDK's
> `signChallenge` bridge rejects when `window.parent === window`, so the embed
> must be nested in an iframe on a host page — never the top-level document.

This is the same architecture as the React Native example — the host page
(`../react-native/host.html`) auto-detects the platform (`window.ReactNativeWebView`
vs the `CherryNative` channel), so one page serves both. Full protocol write-up:
[`../../docs/react-native.md`](../../docs/react-native.md).

## Files

| File | Role |
|---|---|
| `lib/cherry_chat_webview.dart` | Reusable widget. Handshake, config, event forwarding, and the sign bridge. Delivery-agnostic (`.url()` or `.html()`). |
| `lib/wallet.dart` | Native signing — MWA (Android) + Phantom deeplink (iOS). |
| `lib/main_hosted.dart` | **Example 1** — `source.url(...)`, `app-trusted+wallet`. |
| `lib/cherry_host_html.dart` + `lib/main_bundled.dart` | **Example 2** — host page bundled in-app, `source.html(...)`, `wallet-only`. |

## Two ways to ship the host page

### Example 1 — Hosted (`main_hosted.dart`)

Deploy the shared host page to your web server and load it by URL:

```bash
cd cherry-embed-sdk && npm run build
cp dist/index.global.js       <web-root>/cherry-embed.js
cp example/react-native/host.html  <web-root>/cherry-host.html
```

```dart
CherryChatSource.url('https://yoursite.com/cherry-host.html')
```

Add `https://yoursite.com` to your embed app's **Allowed Origins**.

### Example 2 — Bundled (`main_bundled.dart`)

The host page ships inside the Flutter app (`buildCherryHostHtml`); no separate
web deploy. The SDK bundle and chat iframe are still fetched over the network:

```dart
final html = buildCherryHostHtml(sdkUrl: 'https://embed.cherry.fun/cherry-embed.js');
CherryChatSource.html(html, baseUrl: 'https://embed.cherry.fun')
```

With `loadHtmlString` the document has no real origin, so pass a `baseUrl`
(iOS/WKWebView needs it to load the remote SDK `<script>`), and add that origin
(or prefer Example 1) to Allowed Origins.

## Hosting the SDK bundle (`cherry-embed.js`)

`cherry-embed.js` is the SDK's IIFE build (`dist/index.global.js`,
`window.CherryEmbedSDK`, ~10 KB).

- **Cherry-hosted (default):** `https://embed.cherry.fun/cherry-embed.js` —
  rolling URL, same origin as the chat iframe, nothing to host yourself.
- **Self-hosted:** `npm run build` then serve `dist/index.global.js` as
  `application/javascript` (next to your host page for Example 1, or any static
  host / CDN for Example 2).

## Prerequisites

```bash
flutter pub get   # installs webview_flutter, solana_mobile_client, etc.
```

- A Cherry embed app registered in the Admin Panel (`wallet-only` or
  `app-trusted+wallet`), with your host origin in **Allowed Origins**.
- `app-trusted+wallet` also needs a backend endpoint that mints the embed token
  (see [`../app-trusted+wallet/server.js`](../app-trusted%2Bwallet/server.js)).

## Platform setup

### Android (Mobile Wallet Adapter)

- `minSdkVersion` 23+ and an MWA-compatible wallet installed (Phantom, Solflare…).
- On Android 11+, declare wallet intent visibility in
  `android/app/src/main/AndroidManifest.xml`:

  ```xml
  <queries>
    <intent>
      <action android:name="android.intent.action.VIEW" />
      <data android:scheme="solana-wallet" />
    </intent>
  </queries>
  ```

### iOS (Phantom deeplink)

- Register your app's return scheme (`mydapp` in `wallet.dart`) in
  `ios/Runner/Info.plist`:

  ```xml
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLSchemes</key>
      <array><string>mydapp</string></array>
    </dict>
  </array>
  <key>LSApplicationQueriesSchemes</key>
  <array><string>phantom</string></array>
  ```

- The `AppLinks().uriLinkStream` listener in `main_*.dart` forwards Phantom's
  redirect to `handleWalletDeeplink`, which resolves the pending connect/sign.

## Wiring your wallet

`lib/wallet.dart` implements `connectWallet()` and
`signMessageWithWallet(Uint8List)` — MWA on Android, Phantom deeplink on iOS.
The signature must be the raw 64-byte Ed25519 signature over the challenge bytes
**as-is** (no re-hash, no prefix).

> The exact APIs of `solana_mobile_client`, `pinenacl`, `bs58`, and `app_links`
> vary by version — verify the calls in `wallet.dart` against the versions you
> install, and persist the iOS Phantom session (shared secret + session token)
> in secure storage for production.

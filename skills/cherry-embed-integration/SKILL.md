---
name: cherry-embed-integration
description: "Use when embedding Cherry Chat into a web, React Native, or Flutter app with @cherrydotfun/chat-embed-sdk. Detect the host platform first, then follow exactly one path: web (the SDK directly) or mobile (WebView host page + native signing bridge). Covers the two public auth modes (wallet-only, app-trusted+wallet), backend token generation, wallet challenge signing, theming, events, and verification."
---

# Cherry Embed SDK Integration

Use this skill when adding or reviewing a Cherry Chat embed. The SDK embeds public group-room chat only; do not describe it as encrypted DM/E2E messaging.

Full documentation: https://portal.cherry.fun/docs (Chat Embed SDK section).

## Step 0: Detect the Platform

Inspect the project and pick exactly ONE path. Do not mix them.

- A `react-native` dependency in package.json → **Path B (React Native flavor)**.
- A pubspec.yaml with a `flutter:` section → **Path B (Flutter flavor)**.
- Anything else (a browser frontend: plain HTML, React, Next.js, Vue, ...) → **Path A (web)**.

Why the split matters: the SDK is browser-only (`document`/`iframe`/`window.postMessage`). On web it is used directly; on mobile it runs inside a WebView on a small host page, with wallet signing bridged to the native layer. Never install or import the npm package into a mobile JS/Dart runtime.

The Cherry portal's embed editor generates a **platform-adaptive setup prompt** with the same detection step, the same two paths, and the embed's real values (appId, roomId, theme, auth mode, allowed origins). If the user pastes that prompt, treat its config values as authoritative and don't re-ask for them; this skill and that prompt intentionally follow the same structure.

## Discovery

Inspect the host app before giving code:
- Framework and package manager: Next.js, Vite, plain HTML, npm/yarn/pnpm/bun (Path A); RN or Flutter tooling (Path B).
- Where the widget should mount: inline or floating on web; which screen hosts the WebView on mobile.
- Existing Solana wallet integration and how the wallet address/signing API is exposed.
- Whether the host has a backend that can keep a Cherry app secret private.
- Requested auth mode: `wallet-only` (no backend) or `app-trusted+wallet` (backend-signed token + wallet signature). Same choice on both paths.

Ask only for missing operational values:
- `appId` (the embed ID) and `roomId`. Embeds are created self-serve at https://portal.cherry.fun — Project → **Chat embeds** → **New embed**; the host origin must be in the embed's **Allowed origins**.
- Embed URL if the integration should use a non-default environment.
- `appSecret` only for backend work in `app-trusted+wallet`; never ask for it for frontend code.

## Path A: Web

The sections below (Install, Auth Modes, Common Configuration, Events) apply to Path A. The token contract in `app-trusted+wallet` is shared: on Path B the same backend route is used, with the token passed through the bridge config instead of the constructor.

### Install

```bash
npm install @cherrydotfun/chat-embed-sdk
```

Respect the host package manager:

```bash
yarn add @cherrydotfun/chat-embed-sdk
pnpm add @cherrydotfun/chat-embed-sdk
bun add @cherrydotfun/chat-embed-sdk
```

For plain HTML without bundling, load the package from npm via jsDelivr. The bundle exposes `window.CherryEmbedSDK`:

```html
<script src="https://cdn.jsdelivr.net/npm/@cherrydotfun/chat-embed-sdk@0.1.5/dist/index.global.js"></script>
<script>
  const chat = new window.CherryEmbedSDK.CherryEmbed({ /* config */ });
  chat.mount();
</script>
```

### Auth Modes

#### `wallet-only`

Use when the host does not have a backend, or when the embed should manage wallet UX inside the iframe. No token endpoint is required.

```ts
import { CherryEmbed } from '@cherrydotfun/chat-embed-sdk';

const chat = new CherryEmbed({
  appId: 'app_xxx',
  container: '#cherry-chat',
  roomId: 'room_xxx',
});

await chat.mount();
```

If the host must reuse its existing wallet UX in wallet-only mode, provide `walletAddress` and `signChallengeHandler` in the constructor, and listen for `walletConnectRequested` (see Events) so the in-iframe connect button re-arms auth through your flow. Prefer the iframe-managed flow unless there is a product requirement to keep wallet prompts in the host app.

#### `app-trusted+wallet`

Use when Cherry must trust both the host backend token and the user's live wallet signature. This mode has an important lifecycle rule: pass `walletAddress` and `signChallengeHandler` in the `CherryEmbed` constructor before `mount()`. Initial auth commands can trigger `signChallenge` immediately after the iframe bridge becomes ready.

Backend token requirements:
- Sign HS256 JWT with `CHERRY_APP_SECRET` (from the embed's settings at portal.cherry.fun).
- Include `sub` as a valid Solana public key, not an opaque id, username, or email.
- Include `app_id` equal to the Cherry app id.
- Use a short expiry, usually 5 minutes.
- Include `jti` for replay protection.

```ts
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

app.get('/api/cherry/embed-token', requireAuth, (req, res) => {
  const token = jwt.sign(
    {
      sub: req.user.walletAddress,
      app_id: process.env.CHERRY_APP_ID,
    },
    process.env.CHERRY_APP_SECRET!,
    {
      algorithm: 'HS256',
      expiresIn: '5m',
      jwtid: crypto.randomUUID(),
    }
  );

  res.json({ token });
});
```

```ts
import { CherryEmbed } from '@cherrydotfun/chat-embed-sdk';

const { token } = await fetch('/api/cherry/embed-token').then((res) => res.json());

const chat = new CherryEmbed({
  appId: 'app_xxx',
  container: '#cherry-chat',
  roomId: 'room_xxx',
  token,
  walletAddress: publicKey.toBase58(),
  signChallengeHandler: async (messageBytes) => {
    // messageBytes: Uint8Array — sign it as-is; return the signature bytes.
    const signed = await wallet.signMessage(messageBytes);
    return signed.signature ?? signed;
  },
});

await chat.mount();
// Session renewal is automatic (the iframe re-establishes its session from a
// rotating refresh token when it loads).
// To force a fresh exchange, mint a new token and call chat.setToken(token).
```

Do not use this pattern for initial auth:

```ts
await chat.mount();
chat.onSignChallenge(handler);
```

That can race with the iframe's first `signChallenge` request.

### Common Configuration

```ts
const chat = new CherryEmbed({
  appId: 'app_xxx',
  container: '#cherry-chat',
  roomId: 'room_xxx',
  position: 'inline',
  theme: {
    mode: 'dark',
    primaryColor: '#7C3AED',
    backgroundColor: '#111827',
    surfaceColor: '#1F2937',
    textColor: '#F9FAFB',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 'md',
  },
  layout: {
    showHeader: true,
    headerTitle: 'Community Chat',
    showMemberCount: true,
    showInput: true,
  },
});
```

Only the layout keys above are honored by the embed runtime. The full theme reference lives at https://portal.cherry.fun/docs/embed/theming.

For a floating launcher instead of an inline panel, omit `container` and set `position: 'floating-right'` (or `'floating-left'`), optionally with `collapsed: true`.

Keep the container dimensions stable for inline embeds:

```html
<div id="cherry-chat" style="width: 100%; height: 600px;"></div>
```

### Events

```ts
chat.on('ready', () => {});
chat.on('authStateChange', (authenticated) => {});
chat.on('unreadCount', (count) => {});
chat.on('message', ({ roomId, senderId, timestamp }) => {});
chat.on('preview', ({ visible, gated }) => {});
chat.on('walletConnectRequested', () => {
  // Fires when the user clicks "connect" in a preview state and the host
  // manages its own wallet UX. Run your wallet connect flow, then re-arm:
  //   chat.setWalletAddress(addr);  // wallet-only with host-managed wallet
  //   chat.setToken(token);         // app-trusted+wallet
});
```

Destroy old instances during route changes, wallet changes, or React cleanup:

```ts
return () => {
  chat.destroy();
};
```

## Path B: React Native / Flutter

The SDK is DOM-only and cannot run in a mobile JS/Dart runtime. On mobile, run it inside a WebView (`react-native-webview` / `webview_flutter`) on a small **host page**, and bridge wallet signing to the native layer (Mobile Wallet Adapter on Android, a deeplink wallet on iOS).

Hard rules — each one is a real failure mode:

- **Never** `npm install` the SDK into the RN/Flutter app or import `CherryEmbed` in native code; `mount()` throws (no `document`).
- **Never** load `embed.cherry.fun` as the WebView's top document: the iframe bridge rejects when `window.parent === window` and `signChallenge` never starts. The embed must be nested in an iframe on a host page.
- **Never** rely on the iframe's built-in web wallet adapter on mobile (there is no `window.phantom` in a WebView); drive signing natively via the bridge's sign callback. This applies to `wallet-only` too: on mobile it still needs `walletAddress` + the native sign callback.
- The signature returned to the bridge must be the **raw 64-byte Ed25519 signature over the challenge bytes as-is** (no re-hash, no prefix, no base58/hex strings). MWA's `signMessages` may append the signature to the message: slice the last 64 bytes when the result is longer.
- The native wallet round-trip must resolve within the bridge's 60-second sign timeout; do not block it on your own UI.
- Keep DOM storage enabled in the WebView; the Cherry session lives in the iframe's `sessionStorage`.
- Web-only layout options (`container`, `position`, `collapsed`) do not apply; size and place the WebView in the app's own layout.

Install the WebView layer (NOT the SDK):

```bash
# React Native
npm install react-native-webview
npm install @solana-mobile/mobile-wallet-adapter-protocol-web3js @solana/web3.js  # Android signing

# Flutter
flutter pub add webview_flutter
flutter pub add solana_mobile_client app_links  # Android MWA + iOS deeplink return
```

Do not hand-roll the WebView bridge. Copy the ready-made pieces from the SDK repo (https://github.com/cherrydotfun/chat-embed-sdk):

| Piece | React Native | Flutter |
|---|---|---|
| WebView wrapper (handshake, config, events, sign bridge) | `example/react-native/CherryChatWebView.tsx` | `example/flutter/lib/cherry_chat_webview.dart` |
| Native wallet signing | `example/react-native/wallet.ts` | `example/flutter/lib/wallet.dart` |
| Host page (shared; auto-detects RN vs Flutter) | `example/react-native/host.html` (hosted) or `cherryHostHtml.ts` (bundled) | same host page, or `lib/cherry_host_html.dart` (bundled) |
| Runnable apps | `App.hosted.tsx` / `App.bundled.tsx` | `lib/main_hosted.dart` / `lib/main_bundled.dart` |

Decisions to make with the user:

- **Host page delivery:** hosted on their web server (`{ uri }` / `loadRequest`; origin goes in Allowed Origins; updatable without an app release) vs bundled in the app (`{ html }` / `loadHtmlString`; origin is `null`; prefer hosted when they have web hosting).
- **SDK bundle URL:** default `https://embed.cherry.fun/cherry-embed.js` (rolling, Cherry-hosted) vs self-hosted pinned copy of `dist/index.global.js`.
- **Auth mode:** same as web (`wallet-only` / `app-trusted+wallet`); the token contract from Path A applies unchanged, with the token passed via the bridge config's `token` field (mint it fresh right before showing the chat).

Flutter specifics: the `JavaScriptChannel` must be named exactly `CherryNative`; `JavaScriptMode.unrestricted` is required; `loadHtmlString` needs `baseUrl` set to the SDK origin on iOS/WKWebView.

Full guide: `docs/react-native.md` in the SDK repo, or https://portal.cherry.fun/docs/embed/mobile.

## Security Rules

- Never expose `appSecret` in browser code, static HTML, mobile bundles, logs, or frontend env vars.
- Add the host origin to the embed's **Allowed origins** at portal.cherry.fun.
- Token `sub` must be a valid Solana public key.
- Mint embed tokens fresh right before `mount()`; do not cache them. Session renewal afterwards is automatic.
- Include `jti` in backend-issued tokens.
- Register `signChallengeHandler` in the constructor for any flow that sets `walletAddress` during initial mount.
- The iframe bridge protocol uses `id` for request correlation, not `requestId`.

## Verification

Verify the integration end-to-end in the host app.

Path A (web):

1. Load the page — the widget mounts and `ready` fires (no console errors, no `Origin mismatch`).
2. Unauthenticated state shows the room in read-only preview with a connect CTA.
3. Complete the auth flow (wallet connect + signature, or backend token + signature) — `authStateChange` fires with `true`.
4. Send a message and confirm it appears; confirm messages from another session arrive in real time.
5. Reload the page — the session should resume without a new wallet popup.

Path B (React Native / Flutter): steps 2-4 above, plus:

6. Run the typecheck / build (React Native) or `flutter analyze` (Flutter).
7. The host page posts `{ type: 'ready' }` and the chat mounts inside the WebView (watch the forwarded `ready` / `mounted` events).
8. Tapping send in preview triggers the native wallet (MWA intent / deeplink app switch), and the round-trip completes within the 60s bridge timeout.
9. The signature path works end-to-end: `authStateChange` arrives with `true` after native signing (a wrong signature format fails here).

If the SDK itself was modified (inside `chat-embed-sdk`), also run:

```bash
npm run typecheck
npm test
npm run build
```

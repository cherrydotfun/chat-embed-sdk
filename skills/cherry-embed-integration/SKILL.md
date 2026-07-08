---
name: cherry-embed-integration
description: "Use when embedding Cherry Chat into a web app with @cherrydotfun/chat-embed-sdk. Covers the two public auth modes (wallet-only, app-trusted+wallet), backend token generation, wallet challenge signing, theming, events, and verification."
---

# Cherry Embed SDK Integration

Use this skill when adding or reviewing a Cherry Chat embed. The SDK embeds public group-room chat only; do not describe it as encrypted DM/E2E messaging.

Full documentation: https://portal.cherry.fun/docs (Chat Embed SDK section).

## Start With Discovery

Inspect the host app before giving code:
- Framework and package manager: Next.js, Vite, plain HTML, npm/yarn/pnpm/bun.
- Where the widget should mount and whether it is inline or floating.
- Existing Solana wallet integration and how the wallet address/signing API is exposed.
- Whether the host has a backend that can keep a Cherry app secret private.
- Requested auth mode: `wallet-only` (no backend) or `app-trusted+wallet` (backend-signed token + wallet signature).

Ask only for missing operational values:
- `appId` (the embed ID) and `roomId`. Embeds are created self-serve at https://portal.cherry.fun — Project → **Chat embeds** → **New embed**; the host origin must be in the embed's **Allowed origins**.
- Embed URL if the integration should use a non-default environment.
- `appSecret` only for backend work in `app-trusted+wallet`; never ask for it for frontend code.

## Install

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

## Auth Modes

### `wallet-only`

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

### `app-trusted+wallet`

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

## Common Configuration

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

## Events

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

## Security Rules

- Never expose `appSecret` in browser code, static HTML, mobile bundles, logs, or frontend env vars.
- Add the host origin to the embed's **Allowed origins** at portal.cherry.fun.
- Token `sub` must be a valid Solana public key.
- Mint embed tokens fresh right before `mount()`; do not cache them. Session renewal afterwards is automatic.
- Include `jti` in backend-issued tokens.
- Register `signChallengeHandler` in the constructor for any flow that sets `walletAddress` during initial mount.
- The iframe bridge protocol uses `id` for request correlation, not `requestId`.

## Verification

Verify the integration end-to-end in the host app:

1. Load the page — the widget mounts and `ready` fires (no console errors, no `Origin mismatch`).
2. Unauthenticated state shows the room in read-only preview with a connect CTA.
3. Complete the auth flow (wallet connect + signature, or backend token + signature) — `authStateChange` fires with `true`.
4. Send a message and confirm it appears; confirm messages from another session arrive in real time.
5. Reload the page — the session should resume without a new wallet popup.

If the SDK itself was modified (inside `chat-embed-sdk`), also run:

```bash
npm run typecheck
npm test
npm run build
```

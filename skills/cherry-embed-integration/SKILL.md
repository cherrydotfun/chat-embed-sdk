---
name: cherry-embed-integration
description: "Use when embedding Cherry Chat into a web app with @cherrydotfun/embed-sdk. Covers the three supported auth modes, backend token generation, wallet challenge signing, theming, events, and verification."
---

# Cherry Embed SDK Integration

Use this skill when adding or reviewing a Cherry Chat embed. The SDK embeds public group-room chat only; do not describe it as encrypted DM/E2E messaging.

## Start With Discovery

Inspect the host app before giving code:
- Framework and package manager: Next.js, Vite, plain HTML, npm/yarn/pnpm/bun.
- Where the widget should mount and whether it is inline or floating.
- Existing Solana wallet integration and how the wallet address/signing API is exposed.
- Whether the host has a backend that can keep a Cherry app secret private.
- Requested auth mode: `app-trusted`, `app-trusted+wallet`, or `wallet-only`.

Ask only for missing operational values:
- `appId` and `roomId`.
- Embed URL if the integration should use a non-default environment.
- `appSecret` only for backend work in `app-trusted` or `app-trusted+wallet`; never ask for it for frontend code.

## Install

```bash
npm install @cherrydotfun/embed-sdk
```

Respect the host package manager:

```bash
yarn add @cherrydotfun/embed-sdk
pnpm add @cherrydotfun/embed-sdk
bun add @cherrydotfun/embed-sdk
```

For plain HTML without bundling, use the published CDN script if the project already uses script tags:

```html
<script src="https://cdn.cherry.fun/embed/v1/cherry-embed.min.js"></script>
```

## Auth Modes

### `app-trusted`

Use when the host backend already authenticates users and can issue Cherry embed tokens. The frontend does not ask the wallet to sign for Cherry.

Backend token requirements:
- Sign HS256 JWT with `CHERRY_APP_SECRET`.
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
import { CherryEmbed } from '@cherrydotfun/embed-sdk';

const { token } = await fetch('/api/cherry/embed-token').then((res) => res.json());

const chat = new CherryEmbed({
  appId: 'app_xxx',
  container: '#cherry-chat',
  roomId: 'room_xxx',
  token,
  theme: { mode: 'dark', primaryColor: '#7C3AED' },
});

await chat.mount();

chat.on('tokenExpired', async () => {
  const { token: nextToken } = await fetch('/api/cherry/embed-token').then((res) => res.json());
  chat.setToken(nextToken);
});
```

### `app-trusted+wallet`

Use when Cherry must trust both the host backend token and the user's live wallet signature. This mode has an important lifecycle rule: pass `walletAddress` and `signChallengeHandler` in the `CherryEmbed` constructor before `mount()`. Initial auth commands can trigger `signChallenge` immediately after the iframe bridge becomes ready.

```ts
import { CherryEmbed } from '@cherrydotfun/embed-sdk';

const { token } = await fetch('/api/cherry/embed-token').then((res) => res.json());

const chat = new CherryEmbed({
  appId: 'app_xxx',
  container: '#cherry-chat',
  roomId: 'room_xxx',
  token,
  walletAddress: publicKey.toBase58(),
  signChallengeHandler: async (messageBytes) => {
    const signed = await wallet.signMessage(messageBytes);
    return signed.signature ?? signed;
  },
});

await chat.mount();

chat.on('tokenExpired', async () => {
  const { token: nextToken } = await fetch('/api/cherry/embed-token').then((res) => res.json());
  chat.setToken(nextToken);
});
```

Do not use this pattern for initial auth:

```ts
await chat.mount();
chat.onSignChallenge(handler);
```

That can race with the iframe's first `signChallenge` request.

### `wallet-only`

Use when the host does not have a Cherry app secret backend, or when the embed should manage wallet UX inside the iframe. No token endpoint is required.

```ts
import { CherryEmbed } from '@cherrydotfun/embed-sdk';

const chat = new CherryEmbed({
  appId: 'app_xxx',
  container: '#cherry-chat',
  roomId: 'room_xxx',
});

await chat.mount();
```

If the host must reuse its existing wallet UX in wallet-only mode, provide `walletAddress` and `signChallengeHandler` in the constructor. Prefer the iframe-managed flow unless there is a product requirement to keep wallet prompts in the host app.

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
    borderRadius: '8px',
    avatarShape: 'circle',
    compact: false,
  },
  layout: {
    showHeader: true,
    headerTitle: 'Community Chat',
    showMemberCount: true,
    showAvatars: true,
    showTimestamps: true,
    showReactions: true,
    showInput: true,
  },
});
```

Keep the container dimensions stable:

```html
<div id="cherry-chat" style="width: 100%; height: 600px;"></div>
```

## Events

```ts
chat.on('ready', () => {});
chat.on('authStateChange', (authenticated) => {});
chat.on('unreadCount', (count) => {});
chat.on('message', ({ roomId, senderId, timestamp }) => {});
chat.on('tokenExpired', refreshToken);
chat.on('error', ({ code, message }) => {});
```

Destroy old instances during route changes, wallet changes, or React cleanup:

```ts
return () => {
  chat.destroy();
};
```

## Security Rules

- Never expose `appSecret` in browser code, static HTML, mobile bundles, logs, or frontend env vars.
- Configure Cherry Admin `allowedOrigins` to include the host origin.
- Token `sub` must be a valid Solana public key.
- Use short-lived tokens and refresh through `tokenExpired`.
- Include `jti` in backend-issued tokens.
- Register `signChallengeHandler` in the constructor for any flow that sets `walletAddress` during initial mount.
- The iframe bridge protocol uses `id` for request correlation, not `requestId`.
- Live security suites require running Cherry server, host backend, Redis, and three configured app modes before their results are meaningful.

## Verification

For SDK changes inside `cherry-embed-sdk`, run:

```bash
npm run typecheck
npm test
npm run build
```

For embed app changes inside `messaging-server/embed`, run:

```bash
bun run test
bun run build
```

For live security testing, first start the required services and configure:
- `APP_TRUSTED_ID` / `APP_TRUSTED_SECRET`
- `APP_WALLET_ID` / `APP_WALLET_SECRET`
- `APP_WALLETLESS_ID`

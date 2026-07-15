# Cherry Chat Embed — Integration Instructions

Two recommended integration modes:

- **Wallet-Only** — simplest, no backend required. Best for quick drop-in widgets where Cherry is the only source of user identity.
- **App-Trusted + Wallet** — recommended for production public integrations. Adds backend-issued HMAC proof on top of the wallet signature, so a leaked secret alone cannot impersonate users.

---

## Mode 1 — Wallet-Only Integration (Quick Start)

The simplest setup. **No backend, no host wallet code.** The iframe shows its own "Connect Wallet" button and runs the entire Phantom/Solflare/Backpack flow internally.

### 1. Create your embed (self-serve)

Sign in at [portal.cherry.fun](https://portal.cherry.fun) with your Solana wallet (SIWS), create a **Project**, then open **Chat embeds** → **New embed**:

1. Copy the **embed ID** — this is your `appId` (public, safe to expose in client JS).
2. Under **Allowed origins**, add the exact origins where the chat will be embedded, e.g. `https://yoursite.com` (no wildcards — list each subdomain separately, plus your dev origin such as `http://localhost:3000`).
3. Make sure the embed is **enabled**.

The app secret is **not used** in wallet-only mode — you don't need it.

### 2. Install the SDK

```bash
npm install @cherrydotfun/chat-embed-sdk
```

> No build step? Load it from jsDelivr instead — the bundle exposes `window.CherryEmbedSDK`:
> `<script src="https://cdn.jsdelivr.net/npm/@cherrydotfun/chat-embed-sdk@0.1.5/dist/index.global.js"></script>`

### 3. Mount the chat

```ts
import { CherryEmbed } from '@cherrydotfun/chat-embed-sdk';

const chat = new CherryEmbed({
  appId: 'your-app-id',               // embed ID from portal.cherry.fun
  container: '#chat',                 // CSS selector or HTMLElement
  roomId: 'optional-public-room-id',
});

await chat.mount();
```

```html
<div id="chat" style="height: 600px"></div>
```

That's the whole integration. No `token`, no `walletAddress`, no `signChallengeHandler`.

### What the user sees

1. Chat loads in read-only **preview** mode (public room contents visible).
2. To send a message, user clicks **Connect wallet** inside the iframe.
3. Wallet-adapter modal lists installed wallets → user picks one.
4. Phantom popup (connect) → Phantom popup (sign challenge) → authenticated.
5. The Cherry JWT is cached in the iframe's sessionStorage (~15 min). Alongside it, the iframe stores a rotating refresh token (~30-day TTL, keyed per app + wallet in its own origin-isolated localStorage) and silently re-establishes the session when the iframe (re)loads — the user only re-signs after ~30 days of inactivity or revocation.

### Limitations of wallet-only mode

- **Public rooms only, and room access is allow-listed.** No per-user access lists — the embed app's `allowedRoomIds` (configured at portal.cherry.fun) applies to all users equally. This list is **mandatory and fail-closed**: an app with an empty `allowedRoomIds` gets `403` on every room, not access to all public rooms. The chat only works in rooms explicitly allowed for the app (or app-owned rooms with the API enabled).
- **No DM / encrypted-group access** from embed (by design).
- **No host-side identity** — Cherry only knows the wallet address.
- **Message rate limits apply** — default ~20 messages/min per user and ~600 messages/min per app in total; exceeding either returns `429`. Cherry admins can raise these per app on request.
- **Message length is capped** — default max 2000 characters per message; longer messages are rejected with `400`.

### Common pitfalls

- **"Origin mismatch"** — make sure the exact origin (scheme + host + port) is in your embed's **Allowed origins** at portal.cherry.fun.
- **"Room not found" / `403`** — `roomId` must be public and included in the app's `allowedRoomIds` allow-list (an empty allow-list means no rooms are reachable, not all of them).
- **`429` on send** — default per-user/per-app message rate limits were exceeded; back off and retry, or ask Cherry admins to raise the limits for your app.
- **`400` on send** — the message exceeds the app's max length (2000 characters by default).
- **CSP** — if your site uses Content-Security-Policy, allow `frame-src https://embed.cherry.fun`.

Working example to copy: [`example/wallet-only/`](https://github.com/cherrydotfun/chat-embed-sdk/tree/main/example/wallet-only) (in the `chat-embed-sdk` repo).

---

## Mode 2 — App-Trusted + Wallet Integration

Recommended mode for **public 3rd-party integrations**. Requires a small backend on your side, plus host-side wallet connection. The user gets two wallet popups: one to connect, one to sign a challenge — proving both that your app is legitimate (backend HMAC) and that the user controls the wallet (Ed25519 signature).

### 1. Create your embed (self-serve)

Sign in at [portal.cherry.fun](https://portal.cherry.fun) with your Solana wallet (SIWS), create a **Project**, then open **Chat embeds** → **New embed** with auth mode `app-trusted+wallet`:

1. Copy the **embed ID** — this is your public `appId`.
2. Copy the **app secret** — **keep it server-side only**, never ship to the browser.
3. Under **Allowed origins**, add the exact origins where the chat will be embedded, e.g. `https://yoursite.com` (no wildcards — list each subdomain separately).
4. Make sure the embed is **enabled**.

### 2. Install the SDK

```bash
npm install @cherrydotfun/chat-embed-sdk
```

> No build step? Load it from jsDelivr instead — the bundle exposes `window.CherryEmbedSDK`:
> `<script src="https://cdn.jsdelivr.net/npm/@cherrydotfun/chat-embed-sdk@0.1.5/dist/index.global.js"></script>`

You will also need a JWT library on the backend, e.g. `jsonwebtoken`:

```bash
npm install jsonwebtoken
```

### 3. Issue the embed token on your backend

The token is a short-lived HS256 JWT signed with your `appSecret`. `sub` must be the user's Solana wallet address — **derive it from your own authenticated session**, not from the request body (in production).

```ts
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

app.post('/api/embed-token', (req, res) => {
  const walletAddress = req.user.walletAddress; // from your auth session

  const token = jwt.sign(
    { sub: walletAddress, app_id: 'your-app-id' },
    process.env.CHERRY_APP_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '5m',
      jwtid: crypto.randomUUID(), // prevent replay
    },
  );

  res.json({ token });
});
```

### 4. Mount the chat on the frontend

The host page connects the wallet (Phantom in this example), fetches the token, and passes both `token` + `walletAddress` + a `signChallengeHandler` to the SDK.

```ts
import { CherryEmbed } from '@cherrydotfun/chat-embed-sdk';

async function initChat() {
  // 1. Connect wallet on the host page
  const provider = window.phantom?.solana;
  const { publicKey } = await provider.connect();
  const walletAddress = publicKey.toString();

  // 2. Get embed token bound to that wallet
  const { token } = await fetch('/api/embed-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  }).then((r) => r.json());

  // 3. Construct embed. Register signChallengeHandler BEFORE mount.
  const chat = new CherryEmbed({
    appId: 'your-app-id',
    container: '#chat',
    roomId: 'optional-public-room-id',
    token,
    walletAddress,
    signChallengeHandler: async (message) => {
      const { signature } = await provider.signMessage(message, 'utf8');
      return signature; // Uint8Array, 64 bytes (Ed25519)
    },
  });

  await chat.mount();
  // Session renewal is automatic: the iframe silently re-establishes its
  // Cherry session from a rotating refresh token when it (re)loads. If you
  // ever need to force a fresh exchange (e.g. after the user switches
  // accounts), mint a new embed token and call chat.setToken(fresh).
}

initChat();
```

```html
<div id="chat" style="height: 600px"></div>
```

### What the user sees

1. User clicks **Connect Phantom** on your page → Phantom popup *"Connect to site?"*.
2. Your backend issues the embed token bound to that wallet.
3. Iframe loads, Cherry server sends a challenge.
4. Phantom popup *"Sign message?"* → user signs.
5. Cherry verifies both proofs (HMAC token + Ed25519 signature) → issues Cherry JWT (~15 min).
6. Chat is fully authenticated; user can send messages.

Two popups total (connect + sign) — this is expected, not a bug.

### Security model

- **embedToken** (HS256 over `appSecret`) — proves your backend is legitimate.
- **wallet signature** (Ed25519 over a Cherry-issued challenge bound to `appId` + `walletAddress` + parent origin) — proves the user controls the wallet.
- A leaked `appSecret` alone is not enough to impersonate users — wallet key is also required.
- Rotate `appSecret` in your embed's settings at portal.cherry.fun. Rotation is an immediate hard cutover — the old secret is invalidated instantly, so embedTokens signed with it (and live sessions relying on refresh) fail right away. Rotate at a quiet moment and start minting tokens with the new secret immediately.

### Server-side restrictions

Cherry enforces the following limits on embed sessions server-side. Treat them as expected behavior, not bugs — surface them in your UI instead of debugging them as integration errors:

- **Room access is allow-listed and fail-closed.** An embed app's `allowedRoomIds` (configured at portal.cherry.fun) controls which rooms the chat can open. An app with an empty list is denied everywhere — every room request returns `403` — it is **not** granted access to all public rooms. The chat only works in rooms explicitly allowed for the app (or app-owned rooms with the API enabled).
- **Message rate limits.** Default ~20 messages/min per user and ~600 messages/min per app in total. Exceeding either returns `429`. Limits are configurable per app by Cherry admins.
- **In-iframe moderation is disabled by default.** Kicking, banning, muting, changing roles, pinning, or deleting other users' messages from inside the embed returns `403` unless a Cherry admin has enabled moderation for your app. Server-to-server moderation via the Apps API bot keys is unaffected.
- **Message length is capped.** Default max 2000 characters; longer messages are rejected with `400`.
- **Embed session (Cherry JWT) TTL can be shorter than 15 minutes.** Cherry admins can configure a per-app TTL between 5 and 15 minutes. Session renewal via the rotating refresh token stays automatic — no integration change needed.
- **Attachments/media upload can be disabled per app.** Enabled by default; Cherry admins can turn it off on request.

None of this changes the embed token contract itself — the `jwt.sign({ sub, app_id }, APP_SECRET, { algorithm: 'HS256', expiresIn: '5m', jwtid })` shape above is unchanged, and `sub` must always come from your own authenticated session (see below), never from the request body.

### Limitations

- **Public rooms only** for embed flows — no DM / encrypted-group access.
- Embed token expires in 5 minutes — mint it fresh right before `mount()`, don't cache it.
- Cherry JWT expires in ~15 minutes by default (may be shorter, see Server-side restrictions above) — the iframe re-establishes the session automatically from its rotating refresh token on (re)load.

### Common pitfalls

- **"Origin mismatch"** — make sure the exact origin (scheme + host + port) is in your embed's **Allowed origins** at portal.cherry.fun.
- **"Invalid or expired token"** — check `APP_SECRET` matches what Cherry issued; ensure `jti` is unique per token; don't cache tokens.
- **Wallet popup never appears** — `signChallengeHandler` must be passed in the constructor (not added after `mount()`), otherwise the initial challenge fires before the handler is registered.
- **`403` on a room** — the room isn't in the app's `allowedRoomIds` allow-list (an empty allow-list means no rooms are reachable, not all of them); add it in the embed's settings.
- **`403` on kick/ban/mute/role/pin/delete-others from inside the embed** — in-iframe moderation is disabled by default; ask Cherry admins to enable it for your app, or perform moderation server-to-server via the Apps API bot keys instead.
- **`429` on send** — default per-user/per-app message rate limits were exceeded; back off and retry, or ask Cherry admins to raise the limits for your app.
- **`400` on send** — the message exceeds the app's max length (2000 characters by default).
- **Production identity** — derive `walletAddress` from your own server-side session, never trust it from the request body. This is not just an identity risk: room access, rate-limit buckets, and moderation permissions are all enforced against the wallet address in the token, so a spoofed `sub` lets a user inherit another wallet's room access and rate-limit budget.
- **CSP** — allow `frame-src https://embed.cherry.fun`.

Working example to copy: [`example/app-trusted+wallet/`](https://github.com/cherrydotfun/chat-embed-sdk/tree/main/example/app-trusted%2Bwallet) (in the `chat-embed-sdk` repo).

# Cherry Chat Embed — Integration Instructions

Two recommended integration modes:

- **Wallet-Only** — simplest, no backend required. Best for quick drop-in widgets where Cherry is the only source of user identity.
- **App-Trusted + Wallet** — recommended for production public integrations. Adds backend-issued HMAC proof on top of the wallet signature, so a leaked secret alone cannot impersonate users.

---

## Mode 1 — Wallet-Only Integration (Quick Start)

The simplest setup. **No backend, no host wallet code.** The iframe shows its own "Connect Wallet" button and runs the entire Phantom/Solflare/Backpack flow internally.

### 1. Register your app

Contact the Cherry team and provide:

| Field | Value |
|---|---|
| **App Name** | Display name, e.g. `My Site Chat` |
| **Auth Mode** | `wallet-only` |
| **Allowed Origins** | Exact origins where the chat will be embedded, e.g. `https://yoursite.com` (no wildcards — list each subdomain separately) |
| **Allowed Room IDs** | One or more public room IDs to expose (or leave empty for all public rooms) |

In response you will receive a public `appId`. The `App Secret` is **not used** in wallet-only mode — you don't need it.

### 2. Install the SDK

```bash
npm install @cherrydotfun/chat-embed-sdk
```

> CDN distribution is not available yet — use the npm package.

### 3. Mount the chat

```ts
import { CherryEmbed } from '@cherrydotfun/chat-embed-sdk';

const chat = new CherryEmbed({
  appId: 'your-app-id',               // provided by Cherry team
  container: '#chat',                 // CSS selector or HTMLElement
  roomId: 'optional-public-room-id',  // omit to show the room list
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
5. Cherry JWT is cached in the iframe's sessionStorage (~15 min); user re-signs next session.

### Limitations of wallet-only mode

- **Public rooms only.** No per-user access lists — `allowedRoomIds` applies globally.
- **No DM / encrypted-group access** from embed (by design).
- **No host-side identity** — Cherry only knows the wallet address.

### Common pitfalls

- **"Origin mismatch"** — make sure the exact origin (scheme + host + port) was provided to the Cherry team.
- **"Room not found"** — `roomId` must be public and (if a room allowlist is configured) included in it.
- **CSP** — if your site uses Content-Security-Policy, allow `frame-src https://embed.cherry.fun`.

Working example to copy: `cherry-embed-sdk/example/wallet-only/`.

---

## Mode 2 — App-Trusted + Wallet Integration

Recommended mode for **public 3rd-party integrations**. Requires a small backend on your side, plus host-side wallet connection. The user gets two wallet popups: one to connect, one to sign a challenge — proving both that your app is legitimate (backend HMAC) and that the user controls the wallet (Ed25519 signature).

### 1. Register your app

Contact the Cherry team and provide:

| Field | Value |
|---|---|
| **App Name** | Display name, e.g. `My Site Chat` |
| **Auth Mode** | `app-trusted+wallet` |
| **Allowed Origins** | Exact origins where the chat will be embedded, e.g. `https://yoursite.com` (no wildcards — list each subdomain separately) |
| **Allowed Room IDs** | One or more public room IDs to expose (or leave empty for all public rooms) |

In response you will receive:

- a public `appId`
- a private `appSecret` — **keep it server-side only**, never ship to the browser

### 2. Install the SDK

```bash
npm install @cherrydotfun/chat-embed-sdk
```

> CDN distribution is not available yet — use the npm package.

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

  // 4. Refresh token when it expires (~5 min embed token, ~15 min Cherry JWT)
  chat.on('tokenExpired', async () => {
    const { token: fresh } = await fetch('/api/embed-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    }).then((r) => r.json());
    chat.setToken(fresh);
  });
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
- Rotate `appSecret` periodically (ask the Cherry team). The previous secret stays valid for one rotation cycle, then is evicted.

### Limitations

- **Public rooms only** for embed flows — no DM / encrypted-group access.
- Embed token expires in 5 minutes — handle `tokenExpired` to refresh.
- Cherry JWT expires in ~15 minutes — SDK re-exchanges automatically using your fresh token.

### Common pitfalls

- **"Origin mismatch"** — make sure the exact origin (scheme + host + port) was provided to the Cherry team.
- **"Invalid or expired token"** — check `APP_SECRET` matches what Cherry issued; ensure `jti` is unique per token; don't cache tokens.
- **Wallet popup never appears** — `signChallengeHandler` must be passed in the constructor (not added after `mount()`), otherwise the initial challenge fires before the handler is registered.
- **Production identity** — derive `walletAddress` from your own server-side session, never trust it from the request body.
- **CSP** — allow `frame-src https://embed.cherry.fun`.

Working example to copy: `cherry-embed-sdk/example/app-trusted+wallet/`.

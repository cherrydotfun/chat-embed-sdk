# app-trusted+wallet example

authMode: `app-trusted+wallet` — host backend token + Phantom wallet signature.

This is the **recommended default mode** for public 3rd-party integrations.

## When to use this mode

Use `app-trusted+wallet` when:
- You are building a public integration (users are not your own employees/partners)
- You want both application-level and user-level proof of identity
- You need per-user access control (room scopes, rate limiting per walletAddress)
- Security matters: an attacker who steals an embedToken still cannot impersonate
  the wallet owner without also having control of the wallet

Best for:
- NFT community platforms embedding Cherry chat
- DeFi dashboards and DEX front-ends
- Gaming apps with Solana wallets
- Any public 3rd-party Cherry embed integration

## Auth flow

```
user browser          host backend              Cherry server
     |                     |                         |
     | -- user clicks "Connect Phantom" ------------ |
     | -- Phantom.connect() ----------------------- |
     |    (wallet popup: "Connect to site?")         |
     | -- POST /api/embed-token { walletAddress } -->|
     |      (demo: frontend passes address)           |
     |      (real: derive from your auth session)     |
     | <-- { embedToken } --------------------------  |
     |                     |                         |
     | -- CherryEmbed({ token, walletAddress }) ----> |
     |    iframe loads                                |
     |                                               |
     |    Cherry server wants proof of wallet         |
     | <-- cherry:request signChallenge { message } --|
     |    SDK invokes the signChallengeHandler        |
     | -- Phantom.signMessage(challenge) ----------- |
     |    (wallet popup: "Sign message?")             |
     | -- cherry:response { signature } ------------ |
     | -- POST /api/embed/auth { embedToken, sig } -->|
     |    Cherry verifies:                            |
     |      1. HS256 embedToken (appSecret)           |
     |      2. Ed25519 signature (wallet ownership)  |
     | <-- Cherry JWT (15 min) ---------------------- |
     |    chat session begins                         |
     |                     |                         |
```

Two independent proofs:
1. **embedToken** (HS256, appSecret) — proves the host app is legitimate
2. **wallet signature** (Ed25519) — proves the user controls the wallet

## Prerequisites

- Phantom browser extension installed: https://phantom.app
- A Cherry embed created with `authMode: app-trusted+wallet` at
  [portal.cherry.fun](https://portal.cherry.fun) (your Project -> Chat embeds)

## Setup

### 1. Install dependencies (once from the root example/ folder)

```bash
cd chat-embed-sdk/example
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env: fill in APP_ID (embed ID) and APP_SECRET from your embed's settings at portal.cherry.fun
```

### 3. Build the SDK (if not already built)

```bash
cd chat-embed-sdk
npm run build
```

### 4. Start the server

```bash
cd chat-embed-sdk/example
npm run "start:app-trusted+wallet"
# or: node "app-trusted+wallet/server.js"
```

Open http://localhost:3000 and click "Connect Phantom".

## What happens at runtime

1. User clicks "Connect Phantom" — Phantom shows the "Connect to site?" popup
2. Frontend receives `walletAddress = publicKey.toBase58()`
3. Frontend POSTs to `/api/embed-token` — backend issues HS256 JWT
4. `CherryEmbed` is created with `token` + `walletAddress`
5. `chat.mount()` — iframe loads
6. Cherry server sends `signChallenge` via `cherry:request` postMessage
7. SDK invokes the registered `signChallengeHandler`
8. Phantom shows "Sign message?" popup — user approves
9. Signature returned to SDK — forwarded to Cherry server
10. Cherry server verifies Ed25519 — issues Cherry JWT
11. Chat is now fully authenticated

## Security notes

- The user sees **two** wallet popups: "Connect" and "Sign message". This is
  expected and intentional — the signature proves ownership.
- **In production, derive `walletAddress` on the server from your
  authenticated session, never from the request body.** This demo passes it
  from the frontend for simplicity (see step 3 in the auth flow above), but
  that is a stand-in for a real session lookup: room access, rate limits, and
  moderation permissions are all enforced against the wallet address embedded
  in the token, so an un-derived `walletAddress` lets a client spoof another
  wallet's identity and inherit its room access and rate-limit budget.
- `APP_SECRET` must stay server-side only.
- The signature popup message is human-readable, produced by Cherry server —
  users can verify what they are signing.

## Server-side restrictions

Cherry enforces the following limits on embed sessions server-side. These are
expected behavior, not bugs — handle them in your UI rather than debugging
them as integration errors:

- **Room access is allow-listed and fail-closed.** An embed app's
  `allowedRoomIds` (configured at portal.cherry.fun) controls which rooms the
  chat can open. An app with an empty list is denied everywhere — every room
  request returns `403` — it is **not** granted access to all public rooms.
  The chat only works in rooms explicitly allowed for the app (or app-owned
  rooms with the API enabled).
- **Message rate limits.** Default ~20 messages/min per user and ~600
  messages/min per app in total. Exceeding either returns `429`. Limits are
  configurable per app by Cherry admins.
- **In-iframe moderation is disabled by default.** Kicking, banning, muting,
  changing roles, pinning, or deleting other users' messages from inside the
  embed returns `403` unless a Cherry admin has enabled moderation for your
  app. Server-to-server moderation via the Apps API bot keys is unaffected.
- **Message length is capped.** Default max 2000 characters; longer messages
  are rejected with `400`.
- **Embed session (Cherry JWT) TTL can be shorter than 15 minutes.** Cherry
  admins can configure a per-app TTL between 5 and 15 minutes. Session
  renewal via the rotating refresh token stays automatic — no integration
  change needed.
- **Attachments/media upload can be disabled per app.** Enabled by default;
  Cherry admins can turn it off on request.

None of this changes the embed token contract: `jwt.sign({ sub: walletAddress,
app_id }, APP_SECRET, { algorithm: 'HS256', expiresIn: '5m', jwtid })` is
unchanged, and `sub` must always come from your own authenticated session (see
Security notes above), never from the request body.

## Key SDK pattern

```js
const chat = new CherryEmbedSDK.CherryEmbed({
  appId: APP_ID,
  container: '#chat-container',
  token: embedToken,
  walletAddress,
  roomId: ROOM_ID,
  embedUrl: CHERRY_EMBED_URL,
  // Register during construction, before initial auth commands are sent.
  signChallengeHandler: async (messageBytes) => {
    const result = await window.phantom.solana.signMessage(messageBytes, 'utf8');
    return result.signature; // Uint8Array, 64 bytes (Ed25519)
  },
});

await chat.mount();
```

The SDK handles all base64 encoding/decoding between the iframe and the handler.
Your handler only deals with `Uint8Array` on both sides.

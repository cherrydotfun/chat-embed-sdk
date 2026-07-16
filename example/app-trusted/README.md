# app-trusted example

authMode: `app-trusted` — pure, zero-signature. The host backend is the sole
source of trust.

> **This mode is not self-serve.** Unlike `wallet-only` and
> `app-trusted+wallet`, `authMode: app-trusted` is assigned by Cherry admins
> on request — it is not a selectable option when creating an embed at
> [portal.cherry.fun](https://portal.cherry.fun). Ask the Cherry team to
> enable it for your embed before pointing this example at a real `appId`.

## When to use this mode

Use `app-trusted` only when your backend already fully authenticates the
user through your own system (session cookie, OAuth, SIWS, internal SSO —
anything) and a wallet popup would be unacceptable UX. Cherry has **no
independent way to verify** the wallet address asserted in the token — it
trusts the host completely. There is no wallet connect, no signature
challenge, and `onSign`/`signChallengeHandler` never fires.

Best for:
- Internal dashboards and trusted-partner integrations where you control
  both sides of the trust boundary
- Migrating an existing email/password (or SSO) user base onto Cherry chat
  without introducing a wallet-connect step
- Flows where a wallet popup would break the UX (kiosk mode, embedded
  game clients, etc.)

Not appropriate for public 3rd-party integrations — use
[`app-trusted+wallet`](../app-trusted+wallet/) for those; see its README for
the two-proof model.

Cherry requires `sub` in the embed token to be a valid Solana public key.
Do not use opaque user IDs or emails in `sub`.

## Auth flow

```
user browser          host backend              Cherry server
     |                     |                         |
     | -- GET / ---------->|                         |
     | <-- page (HTML) ----|                         |
     |                     |                         |
     | -- POST /api/embed-token -------------------->|
     |      (no walletAddress in the request body —   |
     |       the backend derives it from its own       |
     |       authenticated session)                    |
     | <-- { embedToken } ---------------------------|
     |                     |                         |
     | -- CherryEmbed({ token: embedToken }) -------> |
     |    iframe loads                                |
     |    iframe exchanges embedToken for a Cherry JWT |
     |    server-to-server (HS256, appSecret)          |
     | <-- Cherry JWT (5-15 min) --------------------- |
     |    chat session begins, no wallet popup ever    |
     |                     |                         |
```

The user never sees a wallet popup. Cherry trusts the host backend because
the embedToken is signed with `APP_SECRET` (HS256) — that signature is the
*only* thing standing between "any client" and "any wallet's identity".

## Trust model

`app-trusted` collapses to a single proof: possession of `APP_SECRET`.
There is no second, independent factor like the wallet signature in
`app-trusted+wallet` — whoever can mint a validly-signed embedToken *is*
the user named in `sub` as far as Cherry is concerned. That means the
integrity of this mode depends entirely on (1) `APP_SECRET` never leaving
your server, and (2) `sub` always being read from your own authenticated
session rather than any client-supplied value. Get either of those wrong
and any visitor can impersonate any wallet — room access, rate-limit
budget, and message history included.

## Prerequisites

- Node.js >= 18 — no wallet/browser extension needed, this mode has none
- A Cherry embed with `authMode: app-trusted` enabled by Cherry admins at
  your request (see the note at the top of this file)

## Setup

### 1. Install dependencies (once from the root example/ folder)

```bash
cd chat-embed-sdk/example
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env: fill in APP_ID (embed ID) and APP_SECRET from your embed's
# settings at portal.cherry.fun (or APP_TRUSTED_ID / APP_TRUSTED_SECRET if
# you keep a dedicated embed per mode — see .env.example)
```

### 3. Build the SDK (if not already built)

```bash
cd chat-embed-sdk
npm run build
```

### 4. Start the server

```bash
cd chat-embed-sdk/example
npm run start:app-trusted
# or: node app-trusted/server.js
```

Open http://localhost:3000 — the chat mounts immediately, no click required.

## What happens at runtime

1. Page loads and fetches `/api/config` + `/api/session` (the mock signed-in
   user — see `server.js`).
2. Frontend POSTs to `/api/embed-token` with an **empty body**. The backend
   reads the "logged in" wallet address from its own mock session, not from
   anything the client sent.
3. `CherryEmbed` is constructed with `token` only — no `walletAddress`, no
   `signChallengeHandler`.
4. `chat.mount()` — iframe loads and exchanges the embedToken for a Cherry
   JWT server-to-server. No `cherry:request` for a signature is ever sent.
5. Chat is immediately authenticated. Click "Switch demo user" in the left
   panel to see `chat.setToken()` force a fresh exchange after the mock
   session's identity changes — this stands in for a real account switch.
6. To test as a SPECIFIC wallet, paste any base58 wallet address into the
   "Custom wallet address" field and click "Use wallet" — the mock session
   logs in as that wallet and the chat re-exchanges. Useful for checking a
   real wallet's room access, rate limits, or moderation role. TEST ONLY:
   this is exactly the "client picks the identity" hole a production
   backend must never have.

## Server-side restrictions

Cherry enforces the following limits on embed sessions server-side. These
are expected behavior, not bugs — handle them in your UI rather than
debugging them as integration errors:

- **Room access is allow-listed and fail-closed.** An embed app's
  `allowedRoomIds` (configured at portal.cherry.fun) controls which rooms
  the chat can open. An app with an empty list is denied everywhere — every
  room request returns `403` — it is **not** granted access to all public
  rooms. The chat only works in rooms explicitly allowed for the app (or
  app-owned rooms with the API enabled).
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
unchanged, and `sub` must always come from your own authenticated session
(see Trust model above), never from the request body.

## Key SDK pattern

```js
const chat = new CherryEmbedSDK.CherryEmbed({
  appId: APP_ID,
  container: '#chat-container',
  token: embedToken, // mints from your backend, sub = your session's wallet
  roomId: ROOM_ID,
  embedUrl: CHERRY_EMBED_URL,
  // No walletAddress. No signChallengeHandler. No walletConnectRequested
  // handling. The token alone authenticates.
});

await chat.mount();

// Force a fresh exchange later (e.g. the host-side user switches accounts):
chat.setToken(freshEmbedToken);
```

## What NOT to set up in this mode

- No wallet adapter (Phantom, Solflare, etc.) is needed
- Do not register a `signChallengeHandler` — Cherry never sends a
  `signChallenge` request for `app-trusted` embed apps, so it would never
  fire
- Do not listen for `walletConnectRequested` — that event belongs to
  wallet-driven modes; app-trusted has no equivalent

## Security notes

- `APP_SECRET` must stay server-side only — never expose it in client-side
  code.
- In production, derive `walletAddress` (the token's `sub`) from your
  authenticated session, never from the request body. This demo simulates a
  session with an in-memory `DEMO_USERS` map and a `/api/session/switch`
  endpoint that exists purely so you can see a re-exchange (including logging
  in as an arbitrary wallet for testing) — delete both and wire real session
  middleware before shipping (see the loud comment above `getSessionUser()`
  in `server.js`).
- JTI replay protection is enforced by the Cherry server (Redis-backed).
- embedToken TTL is 5 minutes; the example auto-refreshes 30s before expiry.
- Rotate `APP_SECRET` in your embed's settings at portal.cherry.fun if it
  ever leaks. Rotation is an immediate hard cutover.

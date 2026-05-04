# app-trusted example

authMode: `app-trusted` — zero-signature, host backend is sole source of trust.

## When to use this mode

Use `app-trusted` when your backend already knows who the user is — via its own
session, OAuth token, JWT, or any other mechanism. The host asserts the user's
wallet address (or any stable identifier) without requiring the user to sign
anything with a wallet.

Best for:
- Internal dashboards and partner integrations where you control both sides
- Migration from email/password auth to Cherry chat
- Use cases where wallet popups are unacceptable UX

Cherry currently requires `sub` in the embed token to be a valid Solana public
key. Do not use opaque user IDs or email IDs in `sub`.

## Auth flow

```
user browser          host backend              Cherry server
     |                     |                         |
     | -- GET / ---------->|                         |
     | <-- page (HTML) ----|                         |
     |                     |                         |
     | -- POST /api/embed-token { walletAddress } -->|
     |      (demo: hardcoded wallet in HTML)          |
     |      (real: from your authenticated session)   |
     | <-- { embedToken } ----------------------- ----|
     |                     |                         |
     | -- CherryEmbed({ token: embedToken }) -------> |
     |    iframe loads                                |
     | -- POST /api/embed/auth { embedToken } ------> |
     |    Cherry verifies HS256 with appSecret        |
     | <-- Cherry JWT (15 min) ---------------------- |
     |    chat session begins, no wallet popup        |
     |                     |                         |
```

The user never sees a wallet approval popup. Cherry trusts the host backend
because the embedToken is signed with `APP_SECRET` (HS256).

## Setup

### 1. Install dependencies (once from the root example/ folder)

```bash
cd chat-embed-sdk/example
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env: fill in APP_ID and APP_SECRET from Cherry Admin Panel
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

Open http://localhost:3000 in your browser.

## Files

- `server.js` — Express server with `POST /api/embed-token` endpoint
- `public/index.html` — Frontend: simulates a logged-in user, fetches token, mounts chat

## Security notes

- `APP_SECRET` must stay on the server — never expose it in client-side code
- In production, derive `walletAddress` from your authenticated session, not from
  the request body (the demo passes it in the body for simplicity only)
- JTI replay protection is enforced by the Cherry server (Redis-backed)
- embedToken TTL is 5 minutes; the example auto-refreshes 30 s before expiry

## What NOT to set up in this mode

- No wallet adapter (Phantom, Solflare, etc.) is needed
- Do NOT register `chat.onSignChallenge()` — the Cherry server will not issue
  a signChallenge request for `app-trusted` embed apps

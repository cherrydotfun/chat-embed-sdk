# wallet-only example

authMode: `wallet-only` — no backend, wallet signature is the only auth mechanism.

## When to use this mode

Use `wallet-only` when:
- You cannot or do not want to run a backend server
- You want the simplest possible setup (pure static HTML)
- You are building a self-hosted widget or personal dashboard
- Full decentralization matters more than per-user rate limiting

Best for:
- Personal portfolio pages with Cherry chat
- Static sites (GitHub Pages, IPFS, Vercel static)
- Proof-of-concept integrations
- Community tools where anyone can self-host the widget

## Auth flow

```
user browser             Cherry server
     |                        |
     | -- Phantom.connect() --|
     |    (wallet popup)      |
     |                        |
     | -- CherryEmbed({ walletAddress }) -- iframe loads
     |                        |
     | <- signChallenge request (postMessage cherry:request)
     |    SDK calls onSignChallenge handler
     | -- Phantom.signMessage(challenge)
     |    (wallet popup: "Sign message?")
     | -- cherry:response { signature }
     | -- POST /api/embed/auth { walletAddress, signature, nonce }
     |    Cherry verifies Ed25519 signature
     | <- Cherry JWT (15 min)
     |    chat session begins
     |                        |
```

No host backend is involved at any point. Cherry controls the entire auth flow.

## Requirements

- Phantom browser extension: https://phantom.app
- A Cherry embed app configured with `authMode: wallet-only` in Cherry Admin Panel
- HTTPS origin (or localhost) — wallets will not inject into plain HTTP pages

## How to run

```bash
cd cherry-embed-sdk/example
cp .env.example .env   # fill in APP_ID (and optionally CHERRY_EMBED_URL)
npm install
npm run start:wallet-only
```

Open http://localhost:3000

## Configuration

`APP_ID` and `CHERRY_EMBED_URL` are read from the **shared root `.env`**
(`cherry-embed-sdk/example/.env`) — same file that `app-trusted` and
`app-trusted+wallet` examples use.

```ini
APP_ID=your_app_id_here
CHERRY_EMBED_URL=https://embed.cherry.fun   # or http://localhost:3001 for local Cherry
```

`APP_SECRET` is **not used** by `wallet-only` and may be left empty.

The corresponding embed app must be configured with `authMode: wallet-only`
in the Cherry Admin Panel.

## Why a server.js if it's "wallet-only"?

The "wallet-only" name refers to the absence of a host backend in the **auth
flow** — the browser talks directly to Cherry, no server-side token signing.
The minimal `server.js` here exists only to:

1. Serve static HTML
2. Expose `APP_ID` and `CHERRY_EMBED_URL` from the shared root `.env` via
   `GET /config.json` (so all three examples read config from the same place)

It does NOT see `APP_SECRET`, does NOT call any Cherry endpoint, and does NOT
participate in auth. In production you can replace it with any static host
(nginx, S3, Vercel, GitHub Pages) — just inject `APP_ID` into the HTML at
build time instead of fetching `/config.json`.

## Files

- `server.js` — minimal Express: static + `GET /config.json`
- `public/index.html` — Phantom integration + `onSignChallenge`

## Limitations compared to app-trusted modes

- No per-user customization from host (room access lists, rate limits, etc.)
- User sees wallet popup on every new session (Cherry JWT is 15 min)
- No server-side session — Cherry is the only source of truth
- Public rooms only — no ability to restrict which rooms are accessible per-user
  (the embed app's `allowedRoomIds` setting applies globally for all users)

## Key SDK pattern

```js
chat = new CherryEmbedSDK.CherryEmbed({
  appId: APP_ID,
  container: '#chat-container',
  // NO token property — wallet-only mode has no embedToken
  walletAddress: walletAddress,   // the connected wallet
  embedUrl: CHERRY_EMBED_URL,
});

await chat.mount();

// Register the sign handler AFTER mount() — bridge must be ready
chat.onSignChallenge(async (messageBytes) => {
  const result = await window.phantom.solana.signMessage(messageBytes, 'utf8');
  return result.signature;  // Uint8Array, 64 bytes
});
```

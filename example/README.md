# Cherry Embed SDK — Examples

Two self-contained examples, one for each public Cherry Embed `authMode`.

## Choose your authMode

| | app-trusted+wallet | wallet-only |
|---|:---:|:---:|
| Host backend | required | not needed |
| Wallet adapter | yes (Phantom) | yes (Phantom) |
| `token` (embedToken) | yes | no |
| `walletAddress` | required | required |
| `onSignChallenge` | yes | yes |
| User wallet popup | once per session | once per session |
| Use case | Public 3rd-party (default) | Self-hosted widget, no backend |

## Examples

| Directory | authMode | Backend | Description |
|---|---|---|---|
| [`app-trusted+wallet/`](./app-trusted+wallet/) | `app-trusted+wallet` | Express | Backend token + Phantom signature. |
| [`wallet-only/`](./wallet-only/) | `wallet-only` | None (static) | Phantom only, no backend needed. |
| [`react-native/`](./react-native/) | any | Depends on mode | WebView + native wallet signing (MWA / deeplink). Hosted & bundled host page. |

> **React Native** doesn't use these Express servers — the SDK runs in a
> `react-native-webview` on a host page, with wallet signing bridged to the
> native layer. See [`react-native/README.md`](./react-native/README.md) and
> [`../docs/react-native.md`](../docs/react-native.md).

## Quick start

### Prerequisites

- Node.js >= 18
- Phantom browser extension: https://phantom.app
- A Cherry embed created at [portal.cherry.fun](https://portal.cherry.fun) (your Project → **Chat embeds** → **New embed**)

### 1. Install dependencies (shared, run once)

```bash
cd chat-embed-sdk/example
npm install
```

### 2. Build the SDK (if not already built)

```bash
cd chat-embed-sdk
npm run build
```

### 3. Configure

```bash
cd chat-embed-sdk/example
cp .env.example .env
# Edit .env: fill in APP_ID (your embed ID) and APP_SECRET from your
# embed's settings at portal.cherry.fun
```

### 4. Run an example

**app-trusted+wallet** (backend + Phantom):

```bash
npm run "start:app-trusted+wallet"
# open http://localhost:3000
```

**wallet-only** (no auth backend — a Vite app with its own dependencies and build):

```bash
cd wallet-only && npm install && npm run build && cd ..
npm run start:wallet-only
# open http://localhost:3000
```

> The `wallet-only/server.js` exists only to serve the built SPA and expose
> `APP_ID` from the shared root `.env` via `/config.json`. It does NOT
> participate in auth — the browser talks directly to Cherry.

## Detailed documentation

- [app-trusted+wallet/README.md](./app-trusted+wallet/README.md) — setup, flow, Phantom integration
- [wallet-only/README.md](./wallet-only/README.md) — setup, static serving, limitations

## When to choose which mode

**app-trusted+wallet** — your users have Solana wallets and you want the
strongest security: the host backend proves the app is legitimate (appSecret),
and the wallet signature proves the user is who they claim to be.
This is the **recommended default** for new public integrations.

**wallet-only** — you have no backend or want the simplest possible deployment.
Pure static HTML. Cherry handles all auth directly with the wallet.

## Environment variables

See [`.env.example`](./.env.example) for all variables with comments.

Key variables:

| Variable | Required by | Description |
|---|---|---|
| `APP_ID` | all | Your embed ID from [portal.cherry.fun](https://portal.cherry.fun) |
| `APP_SECRET` | app-trusted+wallet | HS256 signing secret — server-side only |
| `CHERRY_EMBED_URL` | all | Embed iframe URL (default: https://embed.cherry.fun) |
| `PORT` | all | Example server port (default: 3000) |

## Production checklist

- [ ] `.env` is NOT committed to git (it is in `.gitignore`)
- [ ] `APP_SECRET` is never logged or exposed to the browser
- [ ] In app-trusted+wallet mode: derive `walletAddress` from your server
      session, not from the request body
- [ ] Add your production origin to **Allowed origins** in your embed's
      settings at portal.cherry.fun
- [ ] Use Redis or a database for session storage (not in-memory Map)
- [ ] HTTPS only — wallets do not inject into plain HTTP origins
- [ ] Rate limit the `/api/embed-token` endpoint

## Support

- **SDK README:** [`chat-embed-sdk/README.md`](../README.md)
- **Cherry Docs:** https://portal.cherry.fun/docs

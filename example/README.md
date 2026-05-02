# Cherry Embed SDK — Examples

Three self-contained examples, one for each Cherry Embed `authMode`.

## Choose your authMode

| | app-trusted | app-trusted+wallet | wallet-only |
|---|:---:|:---:|:---:|
| Host backend | required | required | not needed |
| Wallet adapter | no | yes (Phantom) | yes (Phantom) |
| `token` (embedToken) | yes | yes | no |
| `walletAddress` | optional | required | required |
| `onSignChallenge` | no | yes | yes |
| User wallet popup | never | once per session | once per session |
| Use case | Internal/trusted integrations | Public 3rd-party (default) | Self-hosted widget, no backend |

## Examples

| Directory | authMode | Backend | Description |
|---|---|---|---|
| [`app-trusted/`](./app-trusted/) | `app-trusted` | Express | Zero-signature. Backend asserts identity. |
| [`app-trusted+wallet/`](./app-trusted+wallet/) | `app-trusted+wallet` | Express | Backend token + Phantom signature. |
| [`wallet-only/`](./wallet-only/) | `wallet-only` | None (static) | Phantom only, no backend needed. |

## Quick start

### Prerequisites

- Node.js >= 18
- Phantom browser extension: https://phantom.app
- A Cherry embed app registered in Cherry Admin Panel

### 1. Install dependencies (shared, run once)

```bash
cd cherry-embed-sdk/example
npm install
```

### 2. Build the SDK (if not already built)

```bash
cd cherry-embed-sdk
npm run build
```

### 3. Configure

```bash
cd cherry-embed-sdk/example
cp .env.example .env
# Edit .env: fill in APP_ID and APP_SECRET from Cherry Admin Panel
```

### 4. Run an example

**app-trusted** (zero-signature, backend only):

```bash
npm run start:app-trusted
# open http://localhost:3000
```

**app-trusted+wallet** (backend + Phantom):

```bash
npm run "start:app-trusted+wallet"
# open http://localhost:3000
```

**wallet-only** (no auth backend — minimal static server reads config from root `.env`):

```bash
npm run start:wallet-only
# open http://localhost:3000
```

> The `wallet-only/server.js` exists only to serve static HTML and expose
> `APP_ID` from the shared root `.env` via `/config.json`. It does NOT
> participate in auth — the browser talks directly to Cherry.

## Detailed documentation

- [app-trusted/README.md](./app-trusted/README.md) — setup, flow, security notes
- [app-trusted+wallet/README.md](./app-trusted+wallet/README.md) — setup, flow, Phantom integration
- [wallet-only/README.md](./wallet-only/README.md) — setup, static serving, limitations

## When to choose which mode

**app-trusted** — you already have authenticated users (your own OAuth/session)
and want to embed Cherry chat without requiring a Solana wallet. Or your users
are walletless.

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
| `APP_ID` | all | Your embed app ID from Cherry Admin Panel |
| `APP_SECRET` | app-trusted, app-trusted+wallet | HS256 signing secret — server-side only |
| `CHERRY_EMBED_URL` | all | Embed iframe URL (default: https://embed.cherry.fun) |
| `PORT` | app-trusted, app-trusted+wallet | Express server port (default: 3000) |

## Production checklist

- [ ] `.env` is NOT committed to git (it is in `.gitignore`)
- [ ] `APP_SECRET` is never logged or exposed to the browser
- [ ] In app-trusted modes: derive `walletAddress` from your server session,
      not from the request body
- [ ] Add your production domain to `allowedOrigins` in Cherry Admin Panel
- [ ] Use Redis or a database for session storage (not in-memory Map)
- [ ] HTTPS only — wallets do not inject into plain HTTP origins
- [ ] Rate limit the `/api/embed-token` endpoint

## Support

- **SDK README:** [`cherry-embed-sdk/README.md`](../README.md)
- **Cherry Docs:** https://cherry.fun/docs/embed

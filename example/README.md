# Cherry Embed SDK Examples

Working examples for all authentication modes and use cases.

## Overview

| Example | Mode | Backend | Auth Method | Best For |
|---------|------|---------|-------------|----------|
| [`server.js`](./server.js) + [`public/`](./public/) | `app-trusted` | Express | Host backend JWT | Internal apps, trusted partners |
| [`wallet-only/index.html`](./wallet-only/index.html) | `wallet-only` | None | Wallet signature | Self-hosted, public chats, minimal setup |
| [`walletless/server.js`](./walletless/server.js) + [`walletless/public/`](./walletless/public/) | `app-trusted` + opaque ID | Express | Email-based, opaque user ID | SaaS, forums, non-Web3 apps |

## Setup

### Prerequisites

- Node.js >= 16
- npm or yarn
- A Cherry Admin account with at least one registered app

### Install Dependencies

```bash
cd example
npm install
```

### Configuration

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Fill in your Cherry app credentials from **Cherry Admin Panel → Embed → Your App → Configuration**:

```env
CHERRY_APP_ID=your-app-id
CHERRY_APP_SECRET=your-app-secret (keep private!)
CHERRY_ROOM_ID=room-id-to-join (optional, for app-trusted mode)
CHERRY_EMBED_URL=http://localhost:3001 (if running locally)
PORT=8080
```

## Running Examples

### 1. App-Trusted (Zero-Signature) — Default Example

Perfect for internal integrations where your backend controls authentication.

```bash
# Terminal 1: Start server
npm start
# Or in watch mode:
npm run dev

# Terminal 2: Open browser
open http://localhost:8080
```

**How it works:**
1. User clicks "Connect Wallet"
2. Phantom signature proves wallet ownership (message only, no blockchain tx)
3. Signature sent to backend
4. Backend issues session token
5. User fetches embed JWT from `/api/embed-token`
6. Chat initializes with JWT (instant login, no further signatures)

**Files:**
- `server.js` — Express backend with `/api/embed-token` endpoint
- `public/index.html` — Frontend with wallet signature + chat mount

---

### 2. Wallet-Only (No Backend)

Completely self-hosted. No server required. Wallet signature is the only proof.

```bash
# Copy to local webserver (e.g., via http-server)
cd wallet-only
npx http-server . -p 8080

# Or open directly (if your app is registered as wallet-only in Admin):
open wallet-only/index.html
```

**How it works:**
1. User connects Phantom wallet directly
2. No backend server involved
3. Cherry server requests signature challenge
4. Frontend signs with wallet
5. Cherry verifies signature
6. User logged in

**Files:**
- `wallet-only/index.html` — Standalone HTML + inline JS

**Limitations:**
- No backend customization
- User always sees "Connect Wallet" UI
- Only for public rooms
- No app-level rate limiting

---

### 3. Walletless (Non-Web3 Apps)

For apps that don't use blockchain wallets. Users log in with email.

```bash
# Start server
cd walletless
npm install # (installs express, jsonwebtoken, etc.)
npm start
# Or: node server.js

# Open browser
open http://localhost:8080
```

**How it works:**
1. User enters email
2. Backend creates session with opaque user ID
3. Backend issues embed JWT with user ID (not wallet)
4. Chat initializes (no wallet needed)
5. User participates in public groups only

**Files:**
- `walletless/server.js` — Email-based backend
- `walletless/public/index.html` — Login form + chat

**Use Cases:**
- SaaS platforms (Notion, Slack-like)
- Community forums
- Internal tools
- Membership sites
- Any app where users have email accounts (not wallets)

---

## Development

### Watch Mode (Auto-Reload)

```bash
npm run dev
```

This uses `nodemon` to restart the server when files change.

### Build SDK (if modifying cherry-embed-sdk)

```bash
# From project root
cd cherry-embed-sdk
npm run build

# Then restart example server to load new bundle
```

### Browser DevTools

#### Network Tab
- Look for `/api/embed-token` — should return JWT
- Look for `/api/embed/auth` — Cherry backend exchange
- Check for CORS errors (origin mismatch)

#### Console
- `CherryEmbedSDK.CherryEmbed` — verify SDK is loaded
- `chat.on('error', ...)` — catch auth/mount errors

#### Application Tab
- `sessionStorage` — Cherry JWT is stored here (not localStorage)
- Check that `cherry_jwt_token` is set after auth

---

## Troubleshooting

### "App ID not configured"

**Cause:** `CHERRY_APP_ID` not in `.env` or not set

**Fix:**
```bash
cat .env
# Check that CHERRY_APP_ID is filled in
# If not: copy .env.example .env and edit
```

### "Invalid signature" (app-trusted mode)

**Cause:** `CHERRY_APP_SECRET` mismatch between `.env` and Admin Panel

**Fix:**
1. Go to **Admin Panel → Embed → Your App → Configuration**
2. Copy the **App Secret** exactly
3. Paste into `.env`
4. Restart server

### "Origin mismatch" error

**Cause:** Your domain not in `allowedOrigins` in Admin Panel

**Fix:**
1. Go to **Admin Panel → Embed → Your App → Configuration**
2. Add `http://localhost:8080` (or your domain)
3. Refresh browser

### "Wallet not detected" (Phantom)

**Cause:** Phantom extension not installed or not compatible

**Fix:**
1. Install Phantom: https://phantom.app
2. Create/import wallet in Phantom
3. Refresh the example page
4. Click "Connect Phantom"

### Chat doesn't appear after login

**Cause:** Room ID doesn't exist or wrong `CHERRY_ROOM_ID`

**Fix:**
1. Go to **Admin Panel → Embed → Your App → Configuration**
2. Copy a valid **Room ID**
3. Paste into `.env` as `CHERRY_ROOM_ID`
4. Restart server

### "Token expired" error

**Cause:** Embed token (5 min) or Cherry JWT (15 min) expired

**Fix:**
- This is normal. The examples listen for `tokenExpired` event and auto-refresh.
- Check console to see if refresh was successful.
- If refresh fails, user must re-auth (refresh page or click "Connect Wallet" again).

---

## Architecture Comparison

### App-Trusted (Default)

```
User Browser          Your Backend          Cherry Server
     │                    │                       │
     ├─ wallet.sign ─────►│                       │
     │  (prove ownership) │                       │
     │                    │                       │
     │◄─ session token ───┤                       │
     │                    │                       │
     ├─ fetch token ─────►│                       │
     │                    ├──── POST /embed/auth ─►│
     │                    │   (sign with appSecret)│
     │                    │◄─── Cherry JWT ────────┤
     │◄─ embedToken ──────┤                       │
     │                    │                       │
     ├─ mount chat ──────────────────────────────►│
     │  (use Cherry JWT)  │                       │
     │                    │                       │
```

**Pros:**
- Zero-signature UX (instant after backend proof)
- Full control over auth flow
- Can enforce rate limits per user
- Session customization (per-room access, etc.)

**Cons:**
- Backend required
- Your responsibility to validate user identity
- Token management on client

---

### Wallet-Only

```
User Browser          Cherry Server
     │                    │
     ├─ GET challenge ────►│
     │◄─ nonce, message ───┤
     │                    │
     ├─ wallet.sign ─────┐│
     │  (user confirms) │ │
     │◄────────────────┘│ │
     │                  │ │
     ├─ POST /embed/auth─►│
     │  (sig + nonce)   │ │
     │◄─ Cherry JWT ────┐│ │
     │  (if sig valid)  │ │
     │◄────────────────┘│ │
     │                    │
     ├─ mount chat ──────►│
     │  (use Cherry JWT)  │
     │                    │
```

**Pros:**
- No backend required
- Maximum decentralization
- Cherry controls authentication entirely

**Cons:**
- Always shows "Connect Wallet" UI
- Slower UX (signature on every session)
- No per-user customization
- Public rates only

---

### Walletless

```
User Browser          Your Backend          Cherry Server
     │                    │                       │
     ├─ email ───────────►│                       │
     │                    │ (your login logic)    │
     │                    │                       │
     │◄─ session ────────┤                        │
     │                    │                        │
     ├─ fetch token ─────►│                       │
     │                    ├──── POST /embed/auth ─►│
     │                    │   (sign with appSecret)│
     │                    │◄─── Cherry JWT ────────┤
     │◄─ embedToken ──────┤                       │
     │                    │                       │
     ├─ mount chat ──────────────────────────────►│
     │  (no wallet needed)│                       │
     │                    │                       │
```

**Pros:**
- No wallet required
- Familiar email login
- Backend controls access
- Stable user identity

**Cons:**
- Backend required
- No wallet signature
- Public groups only (no E2E DM)
- Non-Web3 apps only

---

## Next Steps

### After Testing Locally

1. **Deploy backend** to production (Vercel, Heroku, AWS, etc.)
2. **Update `CHERRY_EMBED_URL`** to production Cherry embed domain
3. **Add production domain** to `allowedOrigins` in Admin Panel
4. **Rotate `CHERRY_APP_SECRET`** in production (never commit to git)
5. **Use Redis/DB** for session storage (not in-memory Map)

### Production Checklist

- [ ] `.env` not committed to git
- [ ] `CHERRY_APP_SECRET` never logged
- [ ] Session storage uses Redis or database
- [ ] HTTPS only (required for wallet signature)
- [ ] Rate limiting on `/api/embed-token` endpoint
- [ ] CORS configured correctly
- [ ] Admin monitoring of token generation

### Extending Examples

- Add room selection dropdown (for `app-trusted+wallet` mode)
- Implement persistent session via httpOnly cookies
- Add user profile/avatar display
- Store user preferences (theme, collapsed state)
- Integrate with your real authentication system

---

## Support

- **Main README:** [`cherry-embed-sdk/README.md`](../README.md)
- **Solana integration:** [`cherry-embed-sdk-solana/README.md`](../../cherry-embed-sdk-solana/README.md)
- **Cherry Docs:** https://cherry.fun/docs/embed
- **GitHub Issues:** https://github.com/cherrydotfun/embed-sdk/issues

---

## License

MIT

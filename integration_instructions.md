# Cherry Chat Embed — Integration Instructions

Two recommended integration modes:

- **Wallet-Only** — simplest, no backend required. Best for quick drop-in widgets where Cherry is the only source of user identity.
- **App-Trusted + Wallet** — recommended for production public integrations. Adds backend-issued HMAC proof on top of the wallet signature, so a leaked secret alone cannot impersonate users.

There is a third mode, **App-Trusted** (zero-signature: your backend's token is the only identity proof, users never connect a wallet). Like the two above it is self-serve — pick it in **Chat embeds** → auth mode at [portal.cherry.fun](https://portal.cherry.fun). It trades away the wallet signature, so use it only when your own login is the source of truth (internal tools, trusted partners); see [`example/app-trusted/`](https://github.com/cherrydotfun/chat-embed-sdk/tree/main/example/app-trusted). Everything below about the token contract, the room allow-list and the server-side restrictions applies to it unchanged.

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
> `<script src="https://cdn.jsdelivr.net/npm/@cherrydotfun/chat-embed-sdk@0.2.0/dist/index.global.js"></script>`

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
- **Cherry only knows the wallet address** — there is no host-side account behind it. You can still relabel people visually (your names and avatars instead of `.sol` domains and shortened addresses) with host-provided identity, below.
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
> `<script src="https://cdn.jsdelivr.net/npm/@cherrydotfun/chat-embed-sdk@0.2.0/dist/index.global.js"></script>`

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

---

## Optional — show your own users instead of wallet identities

Works with **any** of the three auth modes and is independent of them: auth decides *who* may post, this decides *what their row says*. By default that is the wallet identity (a `.sol` domain, or a shortened address); with this on, it is your app's username and avatar.

It is a **visual overlay scoped to one running widget**: Cherry stores none of these names, the wallet stays the author of every message, moderation and mention routing still work off the wallet, and the person's identity in the Cherry app is untouched.

### 1. Turn it on (self-serve)

At [portal.cherry.fun](https://portal.cherry.fun) → your embed → **General** → **"Who your users appear as"** → turn on **"Show your app's names and avatars"**. Until that switch is on the iframe never asks, and whatever your code returns is ignored.

### 2. Answer, from the page or from your backend

Two transports, one contract — pick either.

**From the page.** Pass the handlers in the constructor; they are registered during `mount()`.

```ts
const chat = new CherryEmbed({
  appId: 'your-app-id',
  container: '#chat',
  roomId: 'optional-public-room-id',

  // Called with at most 50 wallets at a time. Return `null` (or omit a wallet)
  // for anyone you don't know — that one keeps its Cherry identity, and the
  // iframe remembers the miss instead of re-asking on every render.
  resolveUsers: async (wallets) => {
    const rows = await myApi.usersByWallet(wallets);
    return Object.fromEntries(
      wallets.map((w) => [w, rows[w] ? { displayName: rows[w].name, avatarUrl: rows[w].photo } : null]),
    );
  },

  // Optional: @mention autocomplete searches YOUR directory. Without it,
  // mentions only match Cherry identities the room already knows.
  searchUsers: async ({ query, cursor, limit }) => {
    const page = await myApi.searchUsers({ query, cursor, limit });
    return { users: page.items, nextCursor: page.next };
  },
});
```

**From your backend.** Set **Profile endpoint** on the same portal card to a base URL; the iframe appends its own paths and never asks the page:

| Request | Body / query | Response |
|---|---|---|
| `POST {url}/resolve` | `{ ids: string[] }` | `{ users: { [wallet]: profile \| null } }` |
| `GET {url}/search` | `?query=&cursor=&limit=` (limit capped at 100) | `{ users: [{ id, displayName?, avatarUrl? }], nextCursor? }` |
| `GET {url}/users/:wallet` | — | `profile \| null` (reserved; not called yet) |

The endpoint wins when both are available. It is the better fit for mobile WebViews, where the host page is a thin shim, and it is unaffected by your app's render loop. Four things to get right:

- **CORS** for the **iframe** origin `https://embed.cherry.fun` — the caller is the iframe, not your page.
- **HTTPS**, since the iframe is served over https and an `http://` endpoint is blocked as mixed content (`localhost` excepted, for development).
- **No cookies**: requests go out with `credentials: 'omit'` deliberately, so the embed can't be walked into replaying a visitor's ambient session at your API. For auth call `chat.setIdentityToken(token)` — sent as `Authorization: Bearer …` on these requests only, memory-only, never persisted.
- The URL comes from Cherry's server config, **never from your page**, so a script on your site cannot repoint identity resolution. Each request carries `X-Cherry-App-Id` so one endpoint can serve several embeds.

### 3. Push changes as they happen

The iframe only asks about wallets it hasn't resolved yet, so a rename in your app is invisible to an already-open chat unless you push it:

```ts
chat.setUserProfiles({ [wallet]: { displayName: 'New name' } });  // avatar kept
chat.invalidateUserProfiles([wallet]);   // re-ask your resolver
chat.invalidateUserProfiles();           // re-ask for everyone
```

Pushed fields are **merged** onto what the iframe already knows, so a rename doesn't disturb the avatar; include a field with an empty value to clear just that field, or push `null` for the wallet to say you no longer know that person. `invalidateUserProfiles` means *refresh*, not *forget*: the current name stays on screen while the fresh answer is in flight, so the row updates once instead of blinking through the fallback. `userProfiles` in the constructor does the same for people you already know at mount time, so the first paint needs no round-trip.

### What Cherry does with your answer

- **Never blocks rendering** — Cherry's own label paints first and is replaced when your answer lands. A slow resolver delays a name, never a message.
- **Memory-only cache, per widget** — nothing persisted, re-asked after 5 minutes or on invalidate, and forgotten when the widget closes.
- **Circuit breaker** — after 3 consecutive failures or timeouts (~4 s deadline) the transport is disabled until you push an update or the visitor reloads, so a long scroll can't hammer a dead endpoint.
- **Sanitized before it reaches the DOM** — `displayName` is flattened to one line and trimmed to 48 characters with zero-width/bidi characters stripped (that is how a lookalike of an existing member gets minted); `avatarUrl` must be an absolute `http(s)` URL, `data:`/`blob:` are refused. Whatever doesn't survive falls back to the Cherry identity, and unknown fields are dropped.
- **Mentions**: picking a suggestion inserts the name with spaces as underscores (`@Alice_Smith`), because the mention grammar stops at the first space. The wallet rides along invisibly, so routing and notifications are unaffected.

### Common pitfalls

- **Nothing is relabelled** — the portal switch is off, or `resolveUsers` was added after `mount()` instead of in the constructor.
- **A rename doesn't show up** — you changed your database but never called `setUserProfiles` / `invalidateUserProfiles`; the iframe doesn't poll.
- **The avatar vanished on rename** — you pushed `{ displayName, avatarUrl: '' }`; an empty value *clears* that field. Send `displayName` alone to keep the avatar.
- **The avatar never appears** — it isn't an absolute `http(s)` URL (a `data:`/`blob:` URL or a relative path is refused).
- **Endpoint never called** — mixed content (`http://` endpoint under an https iframe), a CORS policy that allows your page's origin instead of `https://embed.cherry.fun`, or 3 failures already tripped the breaker.

Test bench for both transports (hand-edited profiles, mention flow, sanitizer probe): [`example/host-identity/`](https://github.com/cherrydotfun/chat-embed-sdk/tree/main/example/host-identity).

Full reference: [Your users' names](https://portal.cherry.fun/docs/embed/host-identity).

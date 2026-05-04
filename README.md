# @cherrydotfun/chat-embed-sdk

Embed Cherry Chat rooms into any website with flexible authentication modes and full theming support. Choose the authentication model that best fits your infrastructure: app-trusted (zero signatures), app-trusted with wallet verification, or wallet-only (no backend required).

## Install

```bash
npm install @cherrydotfun/chat-embed-sdk
```

Or via CDN:

```html
<script src="https://cdn.cherry.fun/embed/v1/cherry-embed.min.js"></script>
```

## Overview

Cherry Embed provides three authentication modes to support different hosting scenarios:

| Mode | Auth Model | Best For | Backend Required | User UX |
|------|-----------|----------|------------------|---------|
| **`app-trusted`** | Host backend signs JWT | Internal apps, trusted partners | Yes (recommended) | Instant login |
| **`app-trusted+wallet`** | Host + wallet signature | Public API, semi-trusted | Yes | Wallet confirmation |
| **`wallet-only`** | Wallet signature only | Self-hosted, minimal backend | No | Wallet confirmation |

All modes support:
- Full read/write access to configured rooms
- Public group-room embed flows (the iframe app does not expose encrypted DMs)
- Real-time messaging via WebSocket
- Theming and layout customization
- Event hooks for integration

## Quick Start (Per Mode)

### 1. App-Trusted (Zero-Signature)

Perfect for internal integrations where your backend controls user identity.

**Backend (`express` example):**

```typescript
import jwt from 'jsonwebtoken';

app.get('/api/embed-token', (req, res) => {
  // Your own authentication ensures this user is valid
  const walletAddress = req.user.walletAddress;
  
  const token = jwt.sign(
    {
      sub: walletAddress,      // User's Solana wallet address
      app_id: 'your-app-id',
    },
    process.env.CHERRY_APP_SECRET, // Shared secret with Cherry admin
    {
      expiresIn: '5m',              // Token expires after 5 minutes
      jwtid: crypto.randomUUID(),   // Prevent replay attacks
    }
  );
  
  res.json({ token });
});
```

**Frontend:**

```typescript
import { CherryEmbed } from '@cherrydotfun/chat-embed-sdk';

async function initChat() {
  // Fetch token from your backend
  const { token } = await fetch('/api/embed-token').then(r => r.json());
  
  const chat = new CherryEmbed({
    appId: 'your-app-id',
    container: '#chat',
    roomId: 'room-id-from-admin',
    token, // User is instantly authenticated
  });
  
  await chat.mount();
  chat.on('ready', () => console.log('Chat ready!'));
}

initChat();
```

**Security Model:**
- Cherry verifies HMAC-SHA256 signature using `appSecret`
- Host backend guarantees user identity (your responsibility)
- Token valid for 5 minutes; Cherry JWT valid for 15 minutes
- No wallet proof required; suitable for trusted integrations

---

### 2. App-Trusted + Wallet (Default Public API)

Combines backend HMAC proof with wallet-signature ownership proof. Backend issues an `embedToken` (same shape as the app-trusted flow); the iframe then independently fetches a challenge from Cherry and asks the host to sign it with the user's wallet.

**Backend (identical to app-trusted — no `nonce` claim):**

```typescript
import jwt from 'jsonwebtoken';

app.post('/api/embed-token', (req, res) => {
  const walletAddress = req.user.walletAddress;

  const token = jwt.sign(
    { sub: walletAddress, app_id: 'your-app-id' },
    process.env.CHERRY_APP_SECRET,
    { expiresIn: '5m', jwtid: crypto.randomUUID(), algorithm: 'HS256' },
  );

  res.json({ token });
});
```

**Frontend (host owns the wallet, e.g. via Phantom):**

```typescript
import { CherryEmbed } from '@cherrydotfun/chat-embed-sdk';

async function initChatWithWallet() {
  // 1. User connects Phantom on the host page
  const provider = window.phantom?.solana;
  const { publicKey } = await provider.connect();
  const walletAddress = publicKey.toString();

  // 2. Host backend issues the embedToken bound to that wallet
  const { token } = await fetch('/api/embed-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  }).then((r) => r.json());

  // 3. Construct embed. Pass `signChallengeHandler` BEFORE mount so it is
  //    registered before Cherry asks for the wallet signature.
  const chat = new CherryEmbed({
    appId: 'your-app-id',
    container: '#chat',
    token,
    walletAddress,
    signChallengeHandler: async (message) => {
      // Cherry server sends the bytes; host wallet signs them.
      const { signature } = await provider.signMessage(message, 'utf8');
      return signature; // Uint8Array
    },
  });

  await chat.mount();
  // The iframe will: GET /api/embed/challenge → invoke signChallengeHandler
  //   → POST /api/embed/auth { embedToken, signature, nonce } → Cherry JWT.
  // The user sees one Phantom popup for the signature.
}
```

**Security Model:**
- App proof: HMAC-SHA256 over `embedToken`, signed by backend with `appSecret`
- Wallet proof: Ed25519 signature over a server-issued challenge that binds
  `appId`, `walletAddress`, and the parent origin
- Cherry cross-validates that `embedToken.sub === challenge.walletAddress`
- Recommended for public-facing integrations: an `appSecret` leak alone does
  not yield a Cherry JWT — wallet key is required as well

---

### 3. Wallet-Only (Self-Hosted, no backend, no host wallet integration)

No backend required AND no host wallet integration required. The iframe owns the entire wallet flow: it shows its own "Connect Wallet" modal, runs its bundled `@solana/wallet-adapter-react` to connect Phantom/Solflare/etc., signs the challenge inside the iframe, and exchanges the signature for a Cherry JWT — all without round-tripping back to the host page.

**Frontend (the entire host integration):**

```html
<script src="https://cdn.cherry.fun/embed/v1/cherry-embed.min.js"></script>
<div id="chat" style="height: 600px"></div>

<script>
  const chat = new CherryEmbedSDK.CherryEmbed({
    appId: 'your-public-app-id', // authMode='wallet-only' app
    container: '#chat',
    roomId: 'optional-public-room-id',
  });
  chat.mount();
</script>
```

That's it. No `token`, no `walletAddress`, no `signChallengeHandler`. The user clicks the in-iframe "Connect wallet to send messages" button → wallet-adapter modal lists installed wallets → user picks one → Phantom popup (connect) → Phantom popup (sign challenge) → Cherry JWT.

> **Backward compat:** if the host DOES supply `walletAddress` (and optionally a `signChallengeHandler`) to a wallet-only app, the iframe falls back to host-managed signing, just like in app-trusted+wallet mode.

**Security Model:**
- No backend required; the wallet's Ed25519 private key is the sole proof of identity
- Cherry issues a per-session challenge bound to (appId, walletAddress, origin); the iframe consumes it once
- Knowing the `appId` confers nothing — anyone with any wallet can authenticate as themselves into the public room scope
- `appSecret` is NOT consulted in this mode; rotating it is a no-op for wallet-only auth
- Best for public rooms, drop-in widgets, decentralized integrations

---

## Wallet Integration

### Generic Callback Pattern

All wallet-signature modes use the `onSignChallenge` handler:

```typescript
chat.onSignChallenge(
  async (message: Uint8Array): Promise<Uint8Array> => {
    // Your wallet adapter signs the message
    const signature = await wallet.signMessage(message);
    return signature; // Must be Uint8Array
  }
);
```

For auth flows that pass `token` and `walletAddress` at construction time,
prefer `signChallengeHandler` in the constructor so the handler is registered
before initial auth commands are sent to the iframe.

The SDK handles:
- Challenge generation via server
- Message encoding/decoding
- Signature verification with Cherry backend
- Session establishment

### Solana Wallet-Adapter Integration

For Solana ecosystem wallets (Phantom, Solflare, Backpack, etc.) the host can wire the SDK to `@solana/wallet-adapter-react` directly — no additional Cherry package required:

```tsx
import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { CherryEmbed } from '@cherrydotfun/chat-embed-sdk';

export function ChatWidget() {
  const { publicKey, signMessage } = useWallet();
  const containerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<CherryEmbed | null>(null);

  useEffect(() => {
    if (!containerRef.current || !publicKey || !signMessage) return;

    const chat = new CherryEmbed({
      appId: 'your-app-id',
      container: containerRef.current,
      walletAddress: publicKey.toBase58(),
      signChallengeHandler: async (message) => signMessage(message),
    });
    chatRef.current = chat;
    chat.mount();
    return () => chat.destroy();
  }, [publicKey, signMessage]);

  return <div ref={containerRef} style={{ height: 600 }} />;
}
```

For `wallet-only` apps you can skip the wallet integration on the host entirely (Section 3) — the iframe runs its own wallet adapter.

---

## Configuration in Admin Panel

To use Cherry Embed, register your app in the Cherry Admin Panel:

### Creating an EmbedApp

1. **Admin Panel** → **Embed** → **Register New App**
2. Fill in:
   - **App Name** — Display name for your app
   - **App ID** — Public identifier (e.g., `my-app`, auto-generated)
   - **App Secret** — Shared secret for HMAC signing (keep private!)
   - **Auth Mode:**
     - `app-trusted`: Your backend only
     - `app-trusted+wallet`: Backend + wallet proof
     - `wallet-only`: Wallet proof only
   - **Allowed Origins** — Domains where iframe is embedded (e.g., `https://myapp.com`)
   - **Allowed Room IDs** — List of room IDs users can access (optional; if empty, all public rooms)

### Configuration Tab

- **Auth Mode** — Switch between modes (affects available SDK features)
- **App Secret** — Rotate periodically via "Rotate Secret" button (shows new value once)
- **Allowed Origins** — Add/remove domains; origin mismatch blocks iframe
- **API Enabled** — Toggle for experimental REST API (admin use)

---

## API Reference

### CherryEmbed Constructor

```typescript
const chat = new CherryEmbed(config: CherryEmbedConfig)
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `appId` | `string` | Yes | App ID from Cherry Admin Panel |
| `container` | `HTMLElement \| string` | Yes | DOM element or CSS selector |
| `token` | `string` | No | Embed JWT for `app-trusted` mode |
| `walletAddress` | `string` | No | Pre-set wallet address for UI |
| `roomId` | `string` | No | Initial room to display |
| `theme` | `EmbedTheme` | No | Visual customization |
| `layout` | `EmbedLayout` | No | Layout options |
| `position` | `'inline' \| 'floating-right' \| 'floating-left'` | No | Widget position (default: `inline`) |
| `collapsed` | `boolean` | No | Start minimized |
| `embedUrl` | `string` | No | Override embed iframe URL |
| `signChallengeHandler` | `(message: Uint8Array) => Promise<Uint8Array>` | No | Wallet signer registered before initial auth commands |

### Methods

```typescript
// Lifecycle
await chat.mount()              // Initialize iframe and connect
chat.destroy()                  // Cleanup and remove iframe

// Authentication (wallet-signature modes)
chat.onSignChallenge(handler)   // Register/update challenge signer after mount
chat.offSignChallenge()         // Unregister signer
chat.setWalletAddress(address)  // Set/update wallet address

// Token management (token-based modes)
chat.setToken(token)            // Refresh embedToken (forces re-exchange)
chat.signOut()                  // Drop iframe sessionStorage JWT and reload

// Room control
chat.setRoom(roomId)            // Switch to different room

// Theming
chat.setTheme(theme)            // Update visual theme
chat.setLayout(layout)          // Update layout options

// Visibility
chat.show()                     // Show widget
chat.hide()                     // Hide widget
chat.toggle()                   // Toggle visibility
```

### Events

```typescript
chat.on('ready', () => {})
  // Fired when iframe is ready (after mount, and again after iframe reload)

chat.on('authStateChange', (authenticated: boolean) => {})
  // Fired when user logs in/out

chat.on('tokenExpired', () => {})
  // Fired when embed token expires; call setToken(newToken) to refresh

chat.on('message', (data) => {})
  // Fired when new message arrives in current room
  // data: { roomId, senderId, timestamp }

chat.on('unreadCount', (count: number) => {})
  // Fired when unread message count changes

chat.on('error', (error) => {})
  // Fired on authentication or runtime errors
  // error: { code: string, message: string }

chat.on('walletConnectRequested', () => {})
  // Fired when iframe asks the host to bring the wallet flow forward.
  // - app-trusted+wallet: host should connect wallet, call setWalletAddress
  // - wallet-only: only fired in the legacy host-managed path; the
  //   self-contained wallet-only flow handles connect inside the iframe

chat.on('preview', ({ visible, gated }) => {})
  // Fired when iframe enters read-only preview mode (room visible, no JWT).
  // Use to render a "Sign in" prompt next to the widget.
```

### Theme Configuration

```typescript
const theme: EmbedTheme = {
  mode: 'dark',                    // 'dark' | 'light'
  primaryColor: '#7C3AED',         // Action color (buttons, links)
  accentColor: '#FF6B6B',          // Highlight color
  backgroundColor: '#1a1a2e',      // Page background
  surfaceColor: '#16213e',         // Card/surface background
  textColor: '#e0e0e0',            // Primary text
  textSecondaryColor: '#a0a0a0',   // Secondary text (timestamps)
  fontFamily: 'Inter, sans-serif',
  fontSize: 'md',                  // 'sm' | 'md' | 'lg'
  borderRadius: '12px',
  avatarShape: 'circle',           // 'circle' | 'square'
  compact: false,                  // Reduce padding/margins
};

chat.setTheme(theme);
```

### Layout Configuration

```typescript
const layout: EmbedLayout = {
  showHeader: true,               // Show/hide room header
  headerTitle: 'Community Chat',   // Custom header title
  showMemberCount: true,           // Show number of members
  showAvatars: true,               // Show user avatars
  showTimestamps: true,            // Show message timestamps
  showReactions: true,             // Show emoji reactions
  showInput: true,                 // Show message input (requires auth)
};

chat.setLayout(layout);
```

### postMessage Protocol

For advanced integration, the SDK communicates with the iframe via postMessage. Most use cases don't need this, but here's the protocol for reference:

**Commands (Host → Iframe):** envelope is `{ type: 'cherry:cmd', method, params }`

```javascript
// Set authentication token
{ type: 'cherry:cmd', method: 'auth.token', params: { token: '...' } }

// Force re-exchange even if a JWT is already cached in iframe sessionStorage
{ type: 'cherry:cmd', method: 'auth.token', params: { token: '...', force: true } }

// Sign out — clears iframe sessionStorage and hard-reloads
{ type: 'cherry:cmd', method: 'auth.logout', params: {} }

// Set wallet address
{ type: 'cherry:cmd', method: 'setWalletAddress', params: { walletAddress: '...' } }

// Update theme
{ type: 'cherry:cmd', method: 'setTheme', params: { mode: 'dark', ... } }

// Update layout
{ type: 'cherry:cmd', method: 'setLayout', params: { showInput: true, ... } }

// Switch room
{ type: 'cherry:cmd', method: 'setRoom', params: { roomId: '...' } }
```

**Events (Iframe → Host):** envelope is `{ type: 'cherry:event', event, data }`

```javascript
// Iframe ready for commands (also re-fires after iframe reload)
{ type: 'cherry:event', event: 'ready' }

// Authentication state changed
{ type: 'cherry:event', event: 'authStateChange', data: true|false }

// Token expired, need refresh
{ type: 'cherry:event', event: 'tokenExpired' }

// New message in room
{ type: 'cherry:event', event: 'message', data: { roomId, senderId, timestamp } }

// Unread count changed
{ type: 'cherry:event', event: 'unreadCount', data: 42 }

// Runtime error
{ type: 'cherry:event', event: 'error', data: { code: '...', message: '...' } }

// Iframe asking host to bring wallet flow forward
{ type: 'cherry:event', event: 'walletConnectRequested' }

// Iframe entered preview (read-only, no JWT)
{ type: 'cherry:event', event: 'preview', data: { visible: true, gated: false } }
```

**Requests/Responses (Iframe ↔ Host):**

```javascript
// Iframe requests wallet signature (wallet-signature modes)
{ 
  type: 'cherry:request',
  id: '...',
  method: 'signChallenge',
  params: { message: '<base64>' } // message bytes encoded as base64
}

// Host responds with signature
{
  type: 'cherry:response',
  id: '...',
  result: { signature: '<base64>' } // signature bytes encoded as base64
}
```

---

## Troubleshooting

### "Origin mismatch" error

**Cause:** The domain where your page is hosted doesn't match `allowedOrigins` in Admin Panel.

**Fix:**
1. Go to **Admin Panel** → **Embed** → Your App → **Configuration**
2. Add your domain to **Allowed Origins** (e.g., `https://myapp.com`)
3. Origins are exact; subdomains like `https://app.myapp.com` require separate entries

---

### "Invalid or expired token" during auth

**Cause:** Embed token expired (5 min) or has wrong signature.

**Fix:**
1. Check that `APP_SECRET` matches between your backend and Admin Panel
2. Verify token is generated fresh (don't cache)
3. Ensure JTI (jwtid) is unique per token
4. Listen for `tokenExpired` event and refresh:
   ```typescript
   chat.on('tokenExpired', async () => {
     const { token } = await fetch('/api/embed-token').then(r => r.json());
     chat.setToken(token); // Send fresh token
   });
   ```

---

### "Wallet not connected" in wallet-signature modes

**Cause:** User hasn't connected their wallet, or the page lost wallet context.

**Fix:**
1. Ensure wallet adapter is properly initialized before mounting chat
2. Check browser console for wallet adapter errors
3. For Solana wallet-adapter, verify all required peer dependencies are installed
4. Listen for `walletConnectRequested` event:
   ```typescript
   chat.on('walletConnectRequested', () => {
     console.log('User should connect wallet now');
   });
   ```

---

### "Room not found" or "No permission"

**Cause:** Room ID doesn't exist, or user doesn't have access (room not in `allowedRoomIds`).

**Fix:**
1. Verify room ID is correct (copy from Cherry Admin)
2. Check that room is public (accessible to embed users)
3. For `app-trusted` apps, verify room ID is in `allowedRoomIds` list in Admin Panel

---

### Message send fails silently

**Cause:** User not authenticated, network issue, or room read-only.

**Fix:**
1. Check `authStateChange` event to confirm authenticated state
2. Verify browser Network tab; look for failed POST to `/api/messages`
3. Ensure `layout.showInput` is true and not disabled by theme
4. Check Firebase browser console for permission errors

---

### Theme/layout changes don't persist after reload

**This is by design.** When the iframe reloads (e.g., after token refresh), it resets to server defaults. To re-apply theme on every reload:

```typescript
chat.on('ready', () => {
  chat.setTheme(myTheme);
  chat.setLayout(myLayout);
});
```

`chat.setToken(newToken)` already forces the iframe to discard its cached
JWT and re-exchange with the fresh embedToken — pass it once on
`tokenExpired`, no extra options needed.

---

## Migration Guide for Existing Integrations

### From Zero-Signature to Wallet-Verified (app-trusted → app-trusted+wallet)

If you already have an app with `app-trusted` mode and want to add wallet proof:

1. **Keep existing code** — `app-trusted` continues to work
2. **Update Admin Panel:**
   - Go to your app → **Configuration** → **Auth Mode**
   - Change to `app-trusted+wallet`
3. **Backend stays the same.** The `embedToken` shape does not change between
   `app-trusted` and `app-trusted+wallet` — same `sub` + `app_id` claims,
   same HMAC signing. The wallet challenge is generated by the Cherry server
   on demand; you do NOT need to add a `nonce` claim to the token.
4. **Update frontend** to pass the wallet signer alongside the existing token:
   ```typescript
   const chat = new CherryEmbed({
     appId,
     container: '#chat',
     token,                  // unchanged — same embedToken
     walletAddress,          // newly required — host's connected wallet
     signChallengeHandler: async (msg) => {
       return await walletAdapter.signMessage(msg);
     },
   });
   await chat.mount();
   ```

Users will see one wallet popup (the signature) before chat access is granted.

---

### From Token-Based to Wallet-Only

If you want to remove your backend dependency entirely:

1. **Update Admin Panel:** change **Auth Mode** to `wallet-only`.
2. **Remove the backend token endpoint** — the iframe authenticates against
   Cherry directly via wallet signature.
3. **Strip the host integration to the bare minimum** — drop `token`,
   `walletAddress`, and `signChallengeHandler` from `CherryEmbed` config:
   ```typescript
   const chat = new CherryEmbed({ appId, container: '#chat', roomId });
   await chat.mount();
   ```
   The iframe will show its own "Connect wallet" CTA, drive a wallet-adapter
   modal, ask the user to sign the challenge inside Phantom/Solflare/etc.,
   and exchange the signature for a Cherry JWT — all without involving the
   host page.

**Backward compat:** if you keep passing `walletAddress` (and an
optional `signChallengeHandler`), the iframe will instead defer wallet
operations to the host — useful when the host already has the wallet
connected for other features (SSO, on-chain actions, etc.).

---

## Examples

See complete working examples (one per auth mode):
- [`example/app-trusted/`](./example/app-trusted/) — Express backend issues `embedToken`, zero-signature browser flow
- [`example/app-trusted+wallet/`](./example/app-trusted%2Bwallet/) — Express backend + Phantom on the host page (signature + token)
- [`example/wallet-only/`](./example/wallet-only/) — Static host (no backend), iframe drives wallet connect itself
- [GitHub recipes](https://github.com/cherrydotfun/embed-examples/) — Next.js, React, Vue, vanilla JS

---

## Performance Tips

1. **Lazy-load the SDK** — Don't load chat if user hasn't opened the widget:
   ```typescript
   let chat: CherryEmbed | null = null;
   
   document.getElementById('chat-btn').addEventListener('click', async () => {
     if (!chat) {
       const { CherryEmbed } = await import('@cherrydotfun/chat-embed-sdk');
       chat = new CherryEmbed({ ... });
       await chat.mount();
     }
     chat.show();
   });
   ```

2. **Reuse iframe** — Don't create multiple instances:
   ```typescript
   // Good: single global chat instance
   const chat = new CherryEmbed({ ... });
   
   // Bad: new instance per page
   // each page navigation creates a new iframe
   ```

3. **Pre-cache tokens** — Fetch token while page loads:
   ```typescript
   async function initChat() {
     // Fetch token in parallel with mount prep
     const tokenPromise = fetch('/api/embed-token').then(r => r.json());
     const { token } = await tokenPromise;
     
     const chat = new CherryEmbed({ appId, container, token });
     await chat.mount();
   }
   ```

---

## Support

- **Documentation:** https://cherry.fun/docs/embed
- **GitHub Issues:** https://github.com/cherrydotfun/chat-embed-sdk/issues
- **Discord:** https://discord.gg/cherry

---

## License

MIT

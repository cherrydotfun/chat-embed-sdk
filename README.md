# @cherrydotfun/embed-sdk

Embed Cherry Chat rooms into any website with flexible authentication modes and full theming support. Choose the authentication model that best fits your infrastructure: app-trusted (zero signatures), app-trusted with wallet verification, or wallet-only (no backend required).

## Install

```bash
npm install @cherrydotfun/embed-sdk
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
| **`walletless`** | Host token + opaque ID | Non-Web3 apps | Yes | Instant login |

All modes support:
- Full read/write access to configured rooms
- E2E encryption for direct messages (except walletless)
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
      sub: walletAddress,      // User's Solana wallet (or opaque ID if walletless)
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
import { CherryEmbed } from '@cherrydotfun/embed-sdk';

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

Combines backend authentication with wallet signature proof. Host backend initiates, wallet owner confirms.

**Backend:**

```typescript
import jwt from 'jsonwebtoken';

// Step 1: Generate app proof (sent to client)
app.get('/api/embed-proof', (req, res) => {
  const walletAddress = req.user.walletAddress;
  const nonce = crypto.randomBytes(16).toString('hex');
  
  const appProof = jwt.sign(
    {
      sub: walletAddress,
      app_id: 'your-app-id',
      nonce,
    },
    process.env.CHERRY_APP_SECRET,
    { expiresIn: '5m', jwtid: crypto.randomUUID() }
  );
  
  res.json({ appProof, walletAddress, nonce });
});
```

**Frontend (with Phantom wallet):**

```typescript
import { CherryEmbed } from '@cherrydotfun/embed-sdk';

async function initChatWithWallet() {
  // Get app proof from your backend
  const { appProof, walletAddress, nonce } = 
    await fetch('/api/embed-proof').then(r => r.json());
  
  const chat = new CherryEmbed({
    appId: 'your-app-id',
    container: '#chat',
    walletAddress, // Pass wallet address for the UI
  });
  
  // Register wallet signer (Phantom example)
  chat.onSignChallenge(async (message) => {
    const provider = window.phantom?.solana;
    if (!provider?.isConnected) throw new Error('Wallet not connected');
    
    const { signature } = await provider.signMessage(message, 'utf8');
    return signature; // Return signature bytes
  });
  
  await chat.mount();
  
  // After mount, send app proof to initiate authentication
  chat.setToken(appProof);
}

initChatWithWallet();
```

**Security Model:**
- App proof: HMAC-SHA256 signed by backend, proves app legitimacy
- Wallet signature: Ed25519 signed by user, proves wallet ownership
- Cherry verifies both signatures
- Recommended for public-facing integrations
- User sees "Connect Wallet" UI before gaining full access

---

### 3. Wallet-Only (Self-Hosted)

No backend required. User signs a challenge directly with their wallet. Minimal infrastructure, maximum proof-of-ownership.

**Frontend:**

```typescript
import { CherryEmbed } from '@cherrydotfun/embed-sdk';

async function initChatWalletOnly() {
  const chat = new CherryEmbed({
    appId: 'your-public-app-id',
    container: '#chat',
  });
  
  // Request wallet address from user
  const walletAddress = await getUserWalletAddress(); // Your UX
  chat.setWalletAddress(walletAddress);
  
  // Register wallet signer
  chat.onSignChallenge(async (message) => {
    const provider = window.phantom?.solana;
    if (!provider?.isConnected) throw new Error('Wallet not connected');
    
    const { signature } = await provider.signMessage(message, 'utf8');
    return signature;
  });
  
  await chat.mount();
}
```

**Security Model:**
- No backend required; user's wallet is sole proof
- Cherry requests nonce challenge, user signs it
- Signature valid for single auth session
- Best for public rooms, decentralized apps
- User always sees "Connect Wallet" UI

---

### 4. Walletless Integration (Non-Web3 Apps)

For apps that don't use Web3/wallets. Host backend generates token with opaque user ID instead of wallet address.

**Backend:**

```typescript
import jwt from 'jsonwebtoken';

app.get('/api/embed-token-walletless', (req, res) => {
  // Your own user ID (email hash, UUID, database ID, etc.)
  const userId = hashEmail(req.user.email); // or req.user.id
  
  const token = jwt.sign(
    {
      sub: userId,              // NOT a wallet address
      app_id: 'your-app-id',
    },
    process.env.CHERRY_APP_SECRET,
    {
      expiresIn: '5m',
      jwtid: crypto.randomUUID(),
    }
  );
  
  res.json({ token });
});
```

**Frontend:**

```typescript
import { CherryEmbed } from '@cherrydotfun/embed-sdk';

async function initChatWalletless() {
  const { token } = await fetch('/api/embed-token-walletless').then(r => r.json());
  
  const chat = new CherryEmbed({
    appId: 'your-app-id',
    container: '#chat',
    token,
    // No wallet connection needed
  });
  
  await chat.mount();
}
```

**Security Model:**
- User ID comes from your backend (you prove user's identity)
- No wallet required; user participates in public groups
- E2E direct messages NOT supported (no encryption key)
- Configured per-app in Cherry Admin Panel
- Useful for SaaS, community forums, internal tools

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

The SDK handles:
- Challenge generation via server
- Message encoding/decoding
- Signature verification with Cherry backend
- Session establishment

### Solana Wallet-Adapter Integration

For Solana ecosystem wallets (Phantom, Solflare, Backpack, etc.), use the optional `@cherry/embed-sdk-solana` package:

```bash
npm install @cherry/embed-sdk-solana
```

```typescript
import { useCherryEmbed } from '@cherry/embed-sdk-solana';
import { useWallet } from '@solana/wallet-adapter-react';

export function ChatWidget() {
  const wallet = useWallet();
  const { mounted, error } = useCherryEmbed({
    appId: 'your-app-id',
    container: '#chat',
    // Wallet is auto-wired via @solana/wallet-adapter-react
  });
  
  if (!mounted) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div id="chat" style={{ height: '600px' }} />;
}
```

See [`@cherry/embed-sdk-solana` README](../cherry-embed-sdk-solana/README.md) for full details.

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
   - **User Identifier:**
     - `wallet`: Standard Solana wallet address
     - `opaque`: Non-wallet user ID (email hash, UUID, etc.)
   - **Allowed Origins** — Domains where iframe is embedded (e.g., `https://myapp.com`)
   - **Allowed Room IDs** — List of room IDs users can access (optional; if empty, all public rooms)

### Configuration Tab

- **Auth Mode** — Switch between modes (affects available SDK features)
- **App Secret** — Rotate periodically via "Rotate Secret" button (shows new value once)
- **Allowed Origins** — Add/remove domains; origin mismatch blocks iframe
- **User Identifier** — Change from `wallet` to `opaque` (affects token generation)
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

### Methods

```typescript
// Lifecycle
await chat.mount()              // Initialize iframe and connect
chat.destroy()                  // Cleanup and remove iframe

// Authentication (wallet-signature modes)
chat.onSignChallenge(handler)   // Register challenge signer
chat.offSignChallenge()         // Unregister signer
chat.setWalletAddress(address)  // Set/update wallet address

// Token management (token-based modes)
chat.setToken(token)            // Authenticate with JWT token

// Room control
chat.setRoom(roomId)            // Switch to different room
chat.on('roomChanged', cb)      // Listen for room changes (list mode)

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
  // Fired when iframe is ready (after mount)

chat.on('authStateChange', (authenticated: boolean) => {})
  // Fired when user logs in/out

chat.on('tokenExpired', () => {})
  // Fired when embed token expires; call setToken(newToken) to refresh

chat.on('message', (data) => {})
  // Fired when new message arrives in current room
  // data: { roomId, senderId, timestamp, content }

chat.on('unreadCount', (count: number) => {})
  // Fired when unread message count changes

chat.on('error', (error) => {})
  // Fired on authentication or runtime errors
  // error: { code: string, message: string }

chat.on('walletConnectRequested', () => {})
  // Fired when user needs to connect wallet (wallet-signature modes)
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
  secondaryTextColor: '#a0a0a0',   // Secondary text (timestamps)
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

**Commands (Host → Iframe):**

```javascript
// Set authentication token
{ type: 'cherry:cmd', command: 'auth.token', data: { token: '...' } }

// Set wallet address
{ type: 'cherry:cmd', command: 'setWalletAddress', data: { address: '...' } }

// Update theme
{ type: 'cherry:cmd', command: 'setTheme', data: { mode: 'dark', ... } }

// Update layout
{ type: 'cherry:cmd', command: 'setLayout', data: { showInput: true, ... } }

// Switch room
{ type: 'cherry:cmd', command: 'setRoom', data: { roomId: '...' } }
```

**Events (Iframe → Host):**

```javascript
// Iframe ready for commands
{ type: 'cherry:event', event: 'ready' }

// Authentication state changed
{ type: 'cherry:event', event: 'authStateChange', data: true|false }

// Token expired, need refresh
{ type: 'cherry:event', event: 'tokenExpired' }

// New message in room
{ type: 'cherry:event', event: 'message', data: {...} }

// Unread count changed
{ type: 'cherry:event', event: 'unreadCount', data: 42 }

// Runtime error
{ type: 'cherry:event', event: 'error', data: { code: '...', message: '...' } }

// Wallet connection requested (wallet-signature modes)
{ type: 'cherry:event', event: 'walletConnectRequested' }
```

**Requests/Responses (Iframe ↔ Host):**

```javascript
// Iframe requests wallet signature (wallet-signature modes)
{ 
  type: 'cherry:request',
  requestId: '...',
  command: 'signChallenge',
  data: { message: '<base64>' } // message bytes encoded as base64
}

// Host responds with signature
{
  type: 'cherry:response',
  requestId: '...',
  data: { signature: '<base64>' } // signature bytes encoded as base64
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

Or use `setToken(token, { force: true })` to force full reload without state loss:

```typescript
chat.setToken(newToken, { force: true });
```

---

## Migration Guide for Existing Integrations

### From Zero-Signature to Wallet-Verified (app-trusted → app-trusted+wallet)

If you already have an app with `app-trusted` mode and want to add wallet proof:

1. **Keep existing code** — `app-trusted` continues to work
2. **Update Admin Panel:**
   - Go to your app → **Configuration** → **Auth Mode**
   - Change to `app-trusted+wallet`
3. **Update backend** to generate `appProof` instead of `embedToken`:
   ```typescript
   // Old (still works):
   // const token = jwt.sign({ sub: wallet, app_id }, appSecret, { expiresIn: '5m' })
   
   // New:
   const appProof = jwt.sign(
     { sub: wallet, app_id, nonce: crypto.randomUUID() },
     appSecret,
     { expiresIn: '5m', jwtid: crypto.randomUUID() }
   );
   ```
4. **Update frontend** to register wallet signer before setToken:
   ```typescript
   chat.onSignChallenge(async (msg) => {
     return await wallet.signMessage(msg);
   });
   chat.setToken(appProof); // Now appProof instead of embedToken
   ```

Users will see wallet confirmation UI before chat access is granted.

---

### From Token-Based to Wallet-Only

If you want to remove your backend dependency:

1. **Update Admin Panel:** Change **Auth Mode** to `wallet-only`
2. **Remove backend token endpoint**
3. **Update frontend:**
   ```typescript
   // Remove setToken() call
   chat.on('ready', () => {
     // No authentication needed; wallet adapter handles it
   });
   ```

---

## Examples

See complete working examples:
- [`cherry-embed-sdk/example/`](./example/) — Zero-signature example (Express + Phantom)
- [GitHub recipes](https://github.com/cherrydotfun/embed-examples/) — Next.js, React, Vue, vanilla JS

---

## Performance Tips

1. **Lazy-load the SDK** — Don't load chat if user hasn't opened the widget:
   ```typescript
   let chat: CherryEmbed | null = null;
   
   document.getElementById('chat-btn').addEventListener('click', async () => {
     if (!chat) {
       const { CherryEmbed } = await import('@cherrydotfun/embed-sdk');
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
- **GitHub Issues:** https://github.com/cherrydotfun/embed-sdk/issues
- **Discord:** https://discord.gg/cherry

---

## License

MIT

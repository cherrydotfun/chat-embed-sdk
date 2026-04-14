---
name: cherry-embed-integration
description: "Use when embedding Cherry Chat into an existing web3 Solana application — adding a public chat room widget with zero-signature authentication, custom theming, and real-time events. Covers backend token generation, frontend SDK setup, and the complete auth flow."
---

# Cherry Embed SDK Integration

Integrate `@cherrydotfun/embed-sdk` into a web3 Solana application to embed a public Cherry Chat room. Users who are already logged in with their wallet on your site will be automatically authenticated in the chat — no additional wallet signatures required.

## When to Use

- Adding a community chat widget to a Solana dApp
- Embedding a public Cherry Chat room into an existing website
- Setting up zero-signature auth flow between your backend and Cherry
- Customizing an embedded chat's theme to match your app's design

## Prerequisites

- A Cherry Embed App registered in the Cherry Admin Panel (you need `appId` and `appSecret`)
- A public Cherry Chat room ID to embed
- Your application has a backend that can sign JWTs (Node.js, Python, etc.)
- Your application has wallet-based authentication (users connect Phantom/Solflare/Backpack)

If the user doesn't have an appId/appSecret yet, tell them:
> Register at Cherry Admin Panel → Embed → Register App. You'll get an appId and appSecret (shown once — save it).

## Integration Checklist

### Step 1: Discovery

Examine the project to understand the tech stack, build system, and where the chat widget should be placed.

Check for:
- Framework (Next.js, Vite, CRA, plain HTML)
- Package manager (npm, yarn, pnpm, bun)
- Existing wallet adapter setup (@solana/wallet-adapter-react or direct provider)
- Backend framework (Express, Fastify, Next.js API routes, etc.)
- How the user's wallet address is available on the backend (JWT, session, cookie)

ASK THE USER:
```
Where should the chat widget appear? (e.g., sidebar, floating button, dedicated page section)
What is your Cherry App ID and Room ID?
```

### Step 2: Install the SDK

```bash
# npm
npm install @cherrydotfun/embed-sdk

# yarn
yarn add @cherrydotfun/embed-sdk

# pnpm
pnpm add @cherrydotfun/embed-sdk

# bun
bun add @cherrydotfun/embed-sdk
```

For plain HTML sites without a build system:
```html
<script src="https://cdn.cherry.fun/embed/v1/cherry-embed.min.js"></script>
```

### Step 3: Backend — Embed Token Endpoint

Create an API endpoint on YOUR backend that generates a Cherry embed token. This token tells Cherry who the user is without requiring them to sign anything.

**The endpoint must:**
1. Verify the user is authenticated (your existing auth)
2. Get their Solana wallet address
3. Sign a JWT with your Cherry `appSecret`
4. Return the token to the frontend

**Node.js / Express:**

```typescript
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

app.get('/api/cherry/embed-token', authMiddleware, (req, res) => {
  const token = jwt.sign(
    {
      sub: req.user.walletAddress,   // User's Solana wallet address
      app_id: process.env.CHERRY_APP_ID,
    },
    process.env.CHERRY_APP_SECRET,   // From Cherry Admin Panel
    {
      algorithm: 'HS256',
      expiresIn: '5m',
      jwtid: crypto.randomUUID(),    // Replay protection
    }
  );
  res.json({ token });
});
```

**Next.js API Route:**

```typescript
// app/api/cherry/embed-token/route.ts
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getServerSession } from 'next-auth'; // or your auth method

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.walletAddress) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const token = jwt.sign(
    {
      sub: session.user.walletAddress,
      app_id: process.env.CHERRY_APP_ID!,
    },
    process.env.CHERRY_APP_SECRET!,
    { algorithm: 'HS256', expiresIn: '5m', jwtid: crypto.randomUUID() }
  );

  return Response.json({ token });
}
```

**Python / FastAPI:**

```python
import jwt, uuid, os
from datetime import datetime, timedelta

@app.get("/api/cherry/embed-token")
async def embed_token(user = Depends(get_current_user)):
    token = jwt.encode(
        {
            "sub": user.wallet_address,
            "app_id": os.environ["CHERRY_APP_ID"],
            "exp": datetime.utcnow() + timedelta(minutes=5),
            "jti": str(uuid.uuid4()),
        },
        os.environ["CHERRY_APP_SECRET"],
        algorithm="HS256",
    )
    return {"token": token}
```

Add these environment variables to your backend:
```bash
CHERRY_APP_ID=your-app-id
CHERRY_APP_SECRET=your-app-secret
```

### Step 4: Frontend — Mount the Chat Widget

**React / Next.js:**

```tsx
import { useEffect, useRef, useState } from 'react';
import { CherryEmbed } from '@cherrydotfun/embed-sdk';

function ChatWidget({ walletAddress }: { walletAddress: string }) {
  const chatRef = useRef<CherryEmbed | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      // 1. Fetch embed token from your backend
      const res = await fetch('/api/cherry/embed-token');
      const { token } = await res.json();

      if (!mounted) return;

      // 2. Create and mount the embed
      const chat = new CherryEmbed({
        appId: 'your-app-id',
        container: '#cherry-chat',
        roomId: 'your-room-id',
        token,
        theme: {
          mode: 'dark',
          primaryColor: '#7C3AED',
        },
      });

      await chat.mount();
      chatRef.current = chat;
      setIsReady(true);

      // 3. Handle token refresh
      chat.on('tokenExpired', async () => {
        const res = await fetch('/api/cherry/embed-token');
        const { token: newToken } = await res.json();
        chat.setToken(newToken);
      });
    }

    init().catch(console.error);

    return () => {
      mounted = false;
      chatRef.current?.destroy();
    };
  }, [walletAddress]);

  return <div id="cherry-chat" style={{ width: '100%', height: '600px' }} />;
}
```

**Vanilla JavaScript:**

```html
<div id="cherry-chat" style="width: 400px; height: 600px;"></div>
<script src="https://cdn.cherry.fun/embed/v1/cherry-embed.min.js"></script>
<script>
  async function initChat() {
    const res = await fetch('/api/cherry/embed-token', {
      headers: { Authorization: 'Bearer ' + sessionToken },
    });
    const { token } = await res.json();

    const chat = new CherryEmbedSDK.CherryEmbed({
      appId: 'your-app-id',
      container: '#cherry-chat',
      roomId: 'your-room-id',
      token: token,
    });
    await chat.mount();

    chat.on('tokenExpired', async () => {
      const res = await fetch('/api/cherry/embed-token', {
        headers: { Authorization: 'Bearer ' + sessionToken },
      });
      const { token: newToken } = await res.json();
      chat.setToken(newToken);
    });
  }

  initChat();
</script>
```

### Step 5: Theming

Match the chat widget to your app's design:

```typescript
const chat = new CherryEmbed({
  // ...
  theme: {
    mode: 'dark',                    // 'dark' | 'light'
    primaryColor: '#7C3AED',         // Buttons, links
    accentColor: '#FF6B6B',          // Secondary accent
    backgroundColor: '#1a1a2e',      // Chat background
    surfaceColor: '#16213e',         // Message bubbles, input
    textColor: '#e0e0e0',            // Primary text
    textSecondaryColor: '#8a8a9a',   // Timestamps, hints
    fontFamily: 'Inter',             // Font (web-safe or Google Fonts)
    fontSize: 'md',                  // 'sm' (13px) | 'md' (14px) | 'lg' (16px)
    borderRadius: '12px',            // Corner radius
    avatarShape: 'circle',           // 'circle' | 'square'
    compact: false,                  // Reduced spacing for small widgets
  },
  layout: {
    showHeader: true,                // Room title bar
    headerTitle: 'Community Chat',   // Custom title
    showMemberCount: true,           // "42 members" in header
    showAvatars: true,               // User avatars next to messages
    showTimestamps: true,            // Message timestamps
    showReactions: true,             // Emoji reactions
    showInput: true,                 // Message input (false = read-only)
  },
});
```

ASK THE USER:
```
What are your app's primary and background colors? I'll configure the theme to match.
```

### Step 6: Event Handling

Listen to chat events for integration with your app's UI:

```typescript
// Unread badge on your navigation
chat.on('unreadCount', (count) => {
  document.querySelector('#chat-badge').textContent = count > 0 ? String(count) : '';
});

// New message notification
chat.on('message', ({ roomId, senderId, timestamp }) => {
  // Show toast, play sound, etc.
});

// Auth state tracking
chat.on('authStateChange', (authenticated) => {
  console.log('Chat auth:', authenticated);
});

// Error handling
chat.on('error', ({ code, message }) => {
  console.error('Chat error:', code, message);
});
```

### Step 7: Widget Positioning

**Inline** (embedded in page layout):
```typescript
const chat = new CherryEmbed({
  position: 'inline',
  container: '#chat-section',
  // ...
});
```

**Floating** (fixed bottom corner):
```typescript
const chat = new CherryEmbed({
  position: 'floating-right',  // or 'floating-left'
  container: document.body,
  collapsed: true,             // Start minimized
  // ...
});

// Toggle with a button
document.querySelector('#chat-toggle').onclick = () => chat.toggle();
```

### Step 8: Verify

1. Open your app with a connected wallet
2. The chat should load automatically (no wallet popup from Cherry)
3. Messages from the public room should appear
4. Sending a message should work
5. Check browser console for `[EmbedShell] Embed auth success`
6. Check your server logs for the `/api/cherry/embed-token` call

If the chat shows "Connect Wallet" instead of loading automatically, check:
- Is your backend returning a valid JWT?
- Is the `sub` claim a valid Solana wallet address?
- Is `CHERRY_APP_SECRET` correct?
- Is the embed app active in Cherry Admin Panel?

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `appSecret` in frontend code | NEVER expose appSecret on the client. It must stay on your backend. |
| Token without `jti` claim | Always include `jti: crypto.randomUUID()` — Cherry rejects tokens without it (replay protection). |
| Token expired before use | Use `expiresIn: '5m'` and refresh via `tokenExpired` event. Don't pre-generate tokens at build time. |
| Wrong `sub` format | `sub` must be a valid base58-encoded Solana public key, not a username or email. |
| CORS errors | Cherry API must allow your embed domain. For dev, the embed app runs on `localhost:3002`. |
| Chat shows but no messages | User may not be a member of the room. Cherry auto-joins public rooms on first embed auth. |
| Multiple CherryEmbed instances | Call `chat.destroy()` before creating a new instance. Only one embed per container. |

## Lifecycle

```
mount() called
  → iframe created
  → bridge ready event ← iframe
  → auth.token sent → iframe
  → iframe: POST /api/embed/auth → Cherry JWT
  → iframe: WebSocket connected
  → iframe: room joined, messages loaded
  → ready event → host
  → authStateChange(true) → host

tokenExpired event → host
  → host fetches new token from backend
  → chat.setToken(newToken)
  → iframe re-authenticates

destroy() called
  → bridge destroyed
  → iframe removed from DOM
  → all listeners cleared
```

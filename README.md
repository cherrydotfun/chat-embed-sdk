# @aspect-fun/cherry-embed-sdk

Embed Cherry Chat public rooms into any website. Lightweight iframe-based SDK with zero-signature authentication and full theming support.

## Install

```bash
npm install @aspect-fun/cherry-embed-sdk
```

Or via CDN:

```html
<script src="https://cdn.cherry.fun/embed/v1/cherry-embed.min.js"></script>
```

## Quick Start

### With npm

```typescript
import { CherryEmbed } from '@aspect-fun/cherry-embed-sdk';

const chat = new CherryEmbed({
  appId: 'your-app-id',
  container: '#chat',
  roomId: 'public-room-id',
  token: embedToken, // JWT from your backend
});

await chat.mount();
```

### With CDN

```html
<div id="chat" style="width: 400px; height: 600px;"></div>
<script src="https://cdn.cherry.fun/embed/v1/cherry-embed.min.js"></script>
<script>
  const chat = new CherryEmbedSDK.CherryEmbed({
    appId: 'your-app-id',
    container: '#chat',
    roomId: 'public-room-id',
    token: embedToken,
  });
  chat.mount();
</script>
```

## Zero-Signature Auth

Users don't sign anything for the chat. Your backend generates a JWT signed with your `appSecret`:

```typescript
// Your backend
import jwt from 'jsonwebtoken';

app.get('/api/embed-token', (req, res) => {
  const token = jwt.sign(
    { sub: req.user.walletAddress, app_id: 'your-app-id' },
    process.env.CHERRY_APP_SECRET,
    { expiresIn: '5m', jwtid: crypto.randomUUID() }
  );
  res.json({ token });
});
```

```typescript
// Your frontend
const { token } = await fetch('/api/embed-token').then(r => r.json());

const chat = new CherryEmbed({
  appId: 'your-app-id',
  container: '#chat',
  token, // User is instantly authenticated, no wallet popup
});
await chat.mount();
```

## API

### `new CherryEmbed(config)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `appId` | `string` | Yes | App ID from Cherry Admin Panel |
| `container` | `HTMLElement \| string` | Yes | DOM element or CSS selector |
| `token` | `string` | No | Embed JWT for zero-signature auth |
| `roomId` | `string` | No | Public room to display |
| `theme` | `EmbedTheme` | No | Visual customization |
| `layout` | `EmbedLayout` | No | Layout options |
| `position` | `'inline' \| 'floating-right' \| 'floating-left'` | No | Widget position (default: `inline`) |
| `collapsed` | `boolean` | No | Start minimized |
| `embedUrl` | `string` | No | Override embed iframe URL |

### Methods

```typescript
await chat.mount()          // Create iframe and initialize
chat.destroy()              // Remove iframe and cleanup
chat.setRoom(roomId)        // Switch room
chat.setTheme(theme)        // Update theme
chat.setLayout(layout)      // Update layout
chat.setToken(token)        // Refresh auth token
chat.show()                 // Show widget
chat.hide()                 // Hide widget
chat.toggle()               // Toggle visibility
```

### Events

```typescript
chat.on('ready', () => {})
chat.on('unreadCount', (count) => {})
chat.on('message', ({ roomId, senderId, timestamp }) => {})
chat.on('authStateChange', (authenticated) => {})
chat.on('tokenExpired', () => {})
chat.on('error', ({ code, message }) => {})
```

### Theme

```typescript
const chat = new CherryEmbed({
  // ...
  theme: {
    mode: 'dark',              // 'dark' | 'light'
    primaryColor: '#7C3AED',
    accentColor: '#FF6B6B',
    backgroundColor: '#1a1a2e',
    surfaceColor: '#16213e',
    textColor: '#e0e0e0',
    fontFamily: 'Inter',
    fontSize: 'md',            // 'sm' | 'md' | 'lg'
    borderRadius: '12px',
    avatarShape: 'circle',     // 'circle' | 'square'
    compact: false,
  },
});
```

### Layout

```typescript
const chat = new CherryEmbed({
  // ...
  layout: {
    showHeader: true,
    headerTitle: 'Community Chat',
    showMemberCount: true,
    showAvatars: true,
    showTimestamps: true,
    showReactions: true,
    showInput: true,
  },
});
```

## Token Refresh

Embed tokens expire (default 5 min). Handle refresh:

```typescript
chat.on('tokenExpired', async () => {
  const { token } = await fetch('/api/embed-token').then(r => r.json());
  chat.setToken(token);
});
```

## Getting Started

1. Register an embed app at **Cherry Admin Panel → Embed → Register App**
2. Save the `appId` and `appSecret`
3. Set up your backend to generate embed tokens (see above)
4. Add the SDK to your frontend

See the [example app](./example/) for a complete working integration.

## Example

A full working example with Express backend and wallet auth:

```bash
cd example
npm install
cp .env.example .env
# Fill in CHERRY_APP_ID, CHERRY_APP_SECRET, CHERRY_ROOM_ID
npm start
# Open http://localhost:8080
```

## License

MIT
